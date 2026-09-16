import {
  ChannelProviderError,
  type MetaPage,
  isGraphPayloadTooLarge,
  isInstagramDmAccessDisabled,
  isInstagramMessagingAdvancedAccessRequired,
  listInstagramMediaComments,
  listPageConversationMessages,
  subscribeMetaPage,
} from "@social-ai/channels";
import { inboundEvents, socialAccounts } from "@social-ai/db";
import { QUEUE_INBOUND_EVENTS } from "@social-ai/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";
import { upsertSocialPost } from "./posts";

function pageIdFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const pageId = (metadata as { pageId?: unknown }).pageId;
  return typeof pageId === "string" && pageId.length > 0 ? pageId : undefined;
}

async function refreshPageWebhookSubscription(
  ctx: ServiceContext,
  account: typeof socialAccounts.$inferSelect,
  accessToken: string,
): Promise<void> {
  if (!ctx.meta) {
    return;
  }
  const pageId =
    pageIdFromMetadata(account.metadataJson) ??
    (account.provider === "facebook" ? account.externalAccountId : undefined);
  if (!pageId) {
    return;
  }
  const page: MetaPage = {
    id: pageId,
    name: account.displayName,
    accessToken,
    instagramUserId:
      account.provider === "instagram" ? account.externalAccountId : undefined,
  };
  try {
    await subscribeMetaPage(ctx.meta, page);
  } catch {
    // Sync must still pull comments even if Meta rejects re-subscribe.
  }
}

export async function syncInstagramComments(
  ctx: ServiceContext,
  organizationId: string,
): Promise<{ ingested: number; seen: number }> {
  if (!ctx.meta) {
    throw new AppError(
      501,
      "META_NOT_CONFIGURED",
      "Set Meta credentials to sync Instagram comments.",
    );
  }

  const accounts = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        eq(socialAccounts.provider, "instagram"),
        eq(socialAccounts.status, "active"),
      ),
    );

  let ingested = 0;
  let seen = 0;

  for (const account of accounts) {
    const accessToken = decryptSecret(
      account.accessTokenEncrypted,
      ctx.tokenKey,
    );
    await refreshPageWebhookSubscription(ctx, account, accessToken);

    let comments: Awaited<ReturnType<typeof listInstagramMediaComments>>;
    try {
      comments = await listInstagramMediaComments(ctx.meta, {
        accessToken,
        igUserId: account.externalAccountId,
        maxMedia: 100,
      });
    } catch (error) {
      if (error instanceof ChannelProviderError) {
        throw new AppError(502, "CHANNEL_PROVIDER_ERROR", error.message);
      }
      throw error;
    }

    seen += comments.length;

    const mediaById = new Map<string, (typeof comments)[number]>();
    for (const comment of comments) {
      if (!mediaById.has(comment.mediaId)) {
        mediaById.set(comment.mediaId, comment);
      }
    }
    for (const media of mediaById.values()) {
      await upsertSocialPost(ctx, account, {
        externalPostId: media.mediaId,
        body: media.caption,
        permalink: media.permalink,
        thumbnailUrl: media.thumbnailUrl,
        mediaType: media.mediaType,
      });
    }

    for (const comment of comments) {
      const event = {
        provider: "instagram",
        accountId: account.externalAccountId,
        externalEventId: `ig:comment:${comment.commentId}`,
        type: "comment.received" as const,
        occurredAt: comment.occurredAt,
        post: {
          externalPostId: comment.mediaId,
          body: comment.caption,
          permalink: comment.permalink,
          thumbnailUrl: comment.thumbnailUrl,
          mediaType: comment.mediaType,
        },
        comment: {
          externalCommentId: comment.commentId,
          externalPostId: comment.mediaId,
          parentExternalCommentId: comment.parentId,
          authorExternalId: comment.authorExternalId,
          authorDisplayName: comment.authorDisplayName,
          body: comment.body || "(empty comment)",
        },
      };

      const inserted = await ctx.db
        .insert(inboundEvents)
        .values({
          organizationId: account.organizationId,
          socialAccountId: account.id,
          provider: account.provider,
          externalEventId: event.externalEventId,
          payloadJson: event as unknown as Record<string, unknown>,
          processingStatus: "received",
        })
        .onConflictDoNothing()
        .returning();

      const row = inserted[0];
      if (!row) {
        continue;
      }
      await ctx.queue.add(QUEUE_INBOUND_EVENTS, { id: row.id });
      ingested += 1;
    }
  }

  return { ingested, seen };
}

export async function syncAllInstagramComments(
  ctx: ServiceContext,
): Promise<{ organizations: number; ingested: number; seen: number }> {
  const rows = await ctx.db
    .selectDistinct({ organizationId: socialAccounts.organizationId })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.provider, "instagram"),
        eq(socialAccounts.status, "active"),
      ),
    );

  let ingested = 0;
  let seen = 0;
  for (const row of rows) {
    const result = await syncInstagramComments(ctx, row.organizationId);
    ingested += result.ingested;
    seen += result.seen;
  }
  return { organizations: rows.length, ingested, seen };
}

function instagramDmAccessHelp(accountLabel: string): string {
  return `${accountLabel}: Instagram blocked DM API access. On the Instagram app: Settings → Messages and story replies → Message controls → Connected tools → turn ON “Allow access to messages”, then Sync again.`;
}

function instagramAdvancedAccessHelp(accountLabel: string): string {
  return `${accountLabel}: Meta needs Advanced Access for instagram_manage_messages to list existing Instagram DMs (too many threads outside app roles). New DMs still arrive via webhook; request Advanced Access in Meta App Review, or use Messenger sync on the linked Page.`;
}

function resolvePageAccessToken(
  account: typeof socialAccounts.$inferSelect,
  accounts: Array<typeof socialAccounts.$inferSelect>,
  tokenKey: string,
  accountToken: string,
): string {
  if (account.provider !== "instagram") {
    return accountToken;
  }
  const pageId = pageIdFromMetadata(account.metadataJson) ?? undefined;
  if (!pageId) {
    return accountToken;
  }
  const pageAccount = accounts.find(
    (row) =>
      row.provider === "facebook" &&
      row.status === "active" &&
      (row.externalAccountId === pageId ||
        pageIdFromMetadata(row.metadataJson) === pageId),
  );
  if (!pageAccount) {
    return accountToken;
  }
  return decryptSecret(pageAccount.accessTokenEncrypted, tokenKey);
}

export async function syncMetaMessages(
  ctx: ServiceContext,
  organizationId: string,
): Promise<{ ingested: number; seen: number; warnings: string[] }> {
  if (!ctx.meta) {
    throw new AppError(
      501,
      "META_NOT_CONFIGURED",
      "Set Meta credentials to sync inbox messages.",
    );
  }

  const accounts = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        inArray(socialAccounts.provider, ["instagram", "facebook"]),
        eq(socialAccounts.status, "active"),
      ),
    );

  let ingested = 0;
  let seen = 0;
  const warnings: string[] = [];

  for (const account of accounts) {
    const accountToken = decryptSecret(
      account.accessTokenEncrypted,
      ctx.tokenKey,
    );
    await refreshPageWebhookSubscription(ctx, account, accountToken);

    const pageId =
      pageIdFromMetadata(account.metadataJson) ??
      (account.provider === "facebook" ? account.externalAccountId : undefined);
    if (!pageId) {
      if (account.provider === "instagram") {
        warnings.push(
          `${account.displayName}: missing linked Facebook Page id. Reconnect the channel.`,
        );
      }
      continue;
    }

    // Conversations edge requires a Page token (Facebook Login path).
    const accessToken = resolvePageAccessToken(
      account,
      accounts,
      ctx.tokenKey,
      accountToken,
    );

    const platform =
      account.provider === "instagram" ? "instagram" : "messenger";
    const selfIds =
      account.provider === "instagram" ? [account.externalAccountId] : [];
    const maxConversations = account.provider === "instagram" ? 10 : 15;
    const messagesPerConversation = account.provider === "instagram" ? 5 : 8;

    let messages: Awaited<ReturnType<typeof listPageConversationMessages>>;
    try {
      messages = await listPageConversationMessages(ctx.meta, {
        accessToken,
        pageId,
        platform,
        selfIds,
        maxConversations,
        messagesPerConversation,
      });
    } catch (error) {
      if (
        error instanceof ChannelProviderError &&
        (isInstagramDmAccessDisabled(error.message) ||
          isInstagramMessagingAdvancedAccessRequired(error.message) ||
          isGraphPayloadTooLarge(error.message) ||
          error.code === "forbidden")
      ) {
        const advanced =
          isInstagramMessagingAdvancedAccessRequired(error.message) ||
          (account.provider === "instagram" &&
            isGraphPayloadTooLarge(error.message));
        warnings.push(
          isInstagramDmAccessDisabled(error.message)
            ? instagramDmAccessHelp(account.displayName)
            : advanced
              ? instagramAdvancedAccessHelp(account.displayName)
              : isGraphPayloadTooLarge(error.message)
                ? `${account.displayName}: Meta rejected the DM sync payload as too large. Try Sync again.`
                : `${account.displayName}: Meta blocked messaging (${error.message})`,
        );
        continue;
      }
      if (error instanceof ChannelProviderError) {
        throw new AppError(502, "CHANNEL_PROVIDER_ERROR", error.message);
      }
      throw error;
    }

    seen += messages.length;
    const prefix = account.provider === "instagram" ? "ig" : "fb";

    for (const message of messages) {
      const event = {
        provider: account.provider,
        accountId: account.externalAccountId,
        externalEventId: `${prefix}:message:${message.messageId}`,
        type:
          message.direction === "inbound"
            ? ("message.received" as const)
            : ("message.sent" as const),
        occurredAt: message.occurredAt,
        conversation: {
          externalConversationId: message.contactExternalId,
          contactExternalId: message.contactExternalId,
          contactDisplayName: message.contactDisplayName,
        },
        message: {
          externalMessageId: message.messageId,
          body: message.body || "(empty message)",
          direction: message.direction,
        },
      };

      const inserted = await ctx.db
        .insert(inboundEvents)
        .values({
          organizationId: account.organizationId,
          socialAccountId: account.id,
          provider: account.provider,
          externalEventId: event.externalEventId,
          payloadJson: event as unknown as Record<string, unknown>,
          processingStatus: "received",
        })
        .onConflictDoNothing()
        .returning();

      const row = inserted[0];
      if (!row) {
        continue;
      }
      await ctx.queue.add(QUEUE_INBOUND_EVENTS, { id: row.id });
      ingested += 1;
    }
  }

  return { ingested, seen, warnings };
}

export async function syncAllMetaMessages(ctx: ServiceContext): Promise<{
  organizations: number;
  ingested: number;
  seen: number;
  warnings: string[];
}> {
  const rows = await ctx.db
    .selectDistinct({ organizationId: socialAccounts.organizationId })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.provider, ["instagram", "facebook"]),
        eq(socialAccounts.status, "active"),
      ),
    );

  let ingested = 0;
  let seen = 0;
  const warnings: string[] = [];
  for (const row of rows) {
    const result = await syncMetaMessages(ctx, row.organizationId);
    ingested += result.ingested;
    seen += result.seen;
    warnings.push(...result.warnings);
  }
  return { organizations: rows.length, ingested, seen, warnings };
}

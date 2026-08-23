import {
  type NormalizedChannelEvent,
  fetchInstagramMedia,
  isMetaProvider,
} from "@social-ai/channels";
import {
  comments,
  contacts,
  conversations,
  inboundEvents,
  messages,
  socialAccounts,
} from "@social-ai/db";
import { QUEUE_INBOUND_EVENTS, QUEUE_MODERATION } from "@social-ai/domain";
import { and, eq, inArray } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import type { ServiceContext } from "./context";
import { decryptSecret, identityHash } from "./crypto";
import { AppError } from "./errors";
import { upsertSocialPost } from "./posts";

export type IngestWebhookInput = {
  provider: string;
  payload: unknown;
  rawBody?: string;
  signature?: string;
};

async function findAccount(
  ctx: ServiceContext,
  provider: string,
  accountId: string,
) {
  const providers = isMetaProvider(provider)
    ? ["instagram", "facebook", "meta"]
    : [provider];
  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.externalAccountId, accountId),
        eq(socialAccounts.status, "active"),
        inArray(socialAccounts.provider, providers),
      ),
    )
    .limit(1);
  return account;
}

export async function ingestWebhook(
  ctx: ServiceContext,
  input: IngestWebhookInput,
): Promise<{
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  ingested: number;
  unmatchedAccountIds?: string[];
}> {
  const adapter = getChannelAdapter(input.provider, ctx.meta);
  const verified = await adapter.verifyWebhook(
    isMetaProvider(input.provider)
      ? {
          payload: input.payload,
          rawBody: input.rawBody,
          signature: input.signature,
        }
      : input.payload,
  );
  if (!verified) {
    throw new AppError(
      401,
      "WEBHOOK_INVALID",
      "Webhook could not be verified.",
    );
  }

  const events = await adapter.normalizeEvent(input.payload);
  if (events.length === 0) {
    if (isMetaProvider(input.provider)) {
      return {
        accepted: true,
        duplicate: false,
        eventId: "ignored",
        ingested: 0,
      };
    }
    throw new AppError(400, "WEBHOOK_EMPTY", "No supported events in payload.");
  }

  let ingested = 0;
  let duplicate = false;
  let lastEventId = "ignored";
  const unmatchedAccountIds: string[] = [];

  for (const event of events) {
    const account = await findAccount(ctx, input.provider, event.accountId);
    if (!account) {
      if (isMetaProvider(input.provider)) {
        unmatchedAccountIds.push(event.accountId);
        continue;
      }
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        "No connected account matches this webhook.",
      );
    }

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
      duplicate = true;
      lastEventId = event.externalEventId;
      continue;
    }

    await ctx.queue.add(QUEUE_INBOUND_EVENTS, { id: row.id });
    ingested += 1;
    lastEventId = row.id;
  }

  if (ingested === 0 && !duplicate && isMetaProvider(input.provider)) {
    return {
      accepted: true,
      duplicate: false,
      eventId: "ignored",
      ingested: 0,
      unmatchedAccountIds,
    };
  }

  if (ingested === 0 && !duplicate) {
    throw new AppError(
      404,
      "ACCOUNT_NOT_FOUND",
      "No connected account matches this webhook.",
    );
  }

  return {
    accepted: true,
    duplicate: ingested === 0 && duplicate,
    eventId: lastEventId,
    ingested,
  };
}

async function persistComment(
  ctx: ServiceContext,
  event: NormalizedChannelEvent,
  account: typeof socialAccounts.$inferSelect,
): Promise<string | undefined> {
  if (!event.comment) {
    return;
  }

  let commentPayload = event.comment;
  const adapter = getChannelAdapter(account.provider, ctx.meta);
  if (!commentPayload.body && adapter.getComment) {
    const hydrated = await adapter.getComment({
      accessToken: decryptSecret(account.accessTokenEncrypted, ctx.tokenKey),
      externalCommentId: commentPayload.externalCommentId,
    });
    if (hydrated) {
      commentPayload = {
        ...commentPayload,
        ...hydrated,
        externalPostId:
          hydrated.externalPostId !== "unknown"
            ? hydrated.externalPostId
            : commentPayload.externalPostId,
      };
    }
  }

  let post = event.post;
  if (
    account.provider === "instagram" &&
    ctx.meta &&
    !post?.thumbnailUrl &&
    commentPayload.externalPostId
  ) {
    try {
      const media = await fetchInstagramMedia(ctx.meta, {
        accessToken: decryptSecret(account.accessTokenEncrypted, ctx.tokenKey),
        mediaId: commentPayload.externalPostId,
      });
      if (media) {
        post = {
          externalPostId: media.id,
          body: media.caption ?? post?.body,
          permalink: media.permalink ?? post?.permalink,
          thumbnailUrl: media.thumbnailUrl,
          mediaType: media.mediaType,
        };
      }
    } catch {
      // Comment ingest still succeeds without a thumbnail.
    }
  }

  const existingPost = await upsertSocialPost(ctx, account, {
    externalPostId: commentPayload.externalPostId,
    body: post?.body,
    permalink: post?.permalink,
    thumbnailUrl: post?.thumbnailUrl,
    mediaType: post?.mediaType,
  });

  const hash = identityHash(account.provider, commentPayload.authorExternalId);
  const [contact] = await ctx.db
    .insert(contacts)
    .values({
      organizationId: account.organizationId,
      externalIdentityHash: hash,
      displayName: commentPayload.authorDisplayName,
    })
    .onConflictDoNothing()
    .returning();

  const [existingContact] =
    contact !== undefined
      ? [contact]
      : await ctx.db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, account.organizationId),
              eq(contacts.externalIdentityHash, hash),
            ),
          )
          .limit(1);

  const [comment] = await ctx.db
    .insert(comments)
    .values({
      organizationId: account.organizationId,
      brandId: account.brandId,
      socialAccountId: account.id,
      postId: existingPost?.id,
      contactId: existingContact?.id,
      externalCommentId: commentPayload.externalCommentId,
      externalPostId: commentPayload.externalPostId,
      parentExternalCommentId: commentPayload.parentExternalCommentId,
      authorExternalId: commentPayload.authorExternalId,
      authorDisplayName: commentPayload.authorDisplayName,
      body: commentPayload.body || "(empty comment)",
      status: "visible",
      moderationStatus: "PENDING",
      ...(event.occurredAt &&
      !Number.isNaN(new Date(event.occurredAt).getTime())
        ? { createdAt: new Date(event.occurredAt) }
        : {}),
    })
    .onConflictDoNothing()
    .returning();

  const persisted =
    comment ??
    (
      await ctx.db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.socialAccountId, account.id),
            eq(comments.externalCommentId, commentPayload.externalCommentId),
          ),
        )
        .limit(1)
    )[0];

  return persisted?.id;
}

async function persistMessage(
  ctx: ServiceContext,
  event: NormalizedChannelEvent,
  account: typeof socialAccounts.$inferSelect,
): Promise<void> {
  if (!event.conversation || !event.message) {
    return;
  }

  const hash = identityHash(
    account.provider,
    event.conversation.contactExternalId,
  );
  const [contact] = await ctx.db
    .insert(contacts)
    .values({
      organizationId: account.organizationId,
      externalIdentityHash: hash,
      displayName: null,
    })
    .onConflictDoNothing()
    .returning();

  const [existingContact] =
    contact !== undefined
      ? [contact]
      : await ctx.db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, account.organizationId),
              eq(contacts.externalIdentityHash, hash),
            ),
          )
          .limit(1);

  if (!existingContact) {
    return;
  }

  const [conversation] = await ctx.db
    .insert(conversations)
    .values({
      organizationId: account.organizationId,
      brandId: account.brandId,
      socialAccountId: account.id,
      contactId: existingContact.id,
      externalConversationId: event.conversation.externalConversationId,
      status: "open",
      unread: event.message.direction === "inbound",
      lastMessageAt: new Date(event.occurredAt),
    })
    .onConflictDoNothing()
    .returning();

  const [existingConversation] =
    conversation !== undefined
      ? [conversation]
      : await ctx.db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.socialAccountId, account.id),
              eq(
                conversations.externalConversationId,
                event.conversation.externalConversationId,
              ),
            ),
          )
          .limit(1);

  if (!existingConversation) {
    return;
  }

  await ctx.db
    .insert(messages)
    .values({
      organizationId: account.organizationId,
      conversationId: existingConversation.id,
      externalMessageId: event.message.externalMessageId,
      direction: event.message.direction,
      senderType: event.message.direction === "inbound" ? "contact" : "brand",
      senderExternalId: event.conversation.contactExternalId,
      body: event.message.body || "(empty message)",
    })
    .onConflictDoNothing();

  await ctx.db
    .update(conversations)
    .set({
      lastMessageAt: new Date(event.occurredAt),
      unread: event.message.direction === "inbound",
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, existingConversation.id));
}

export async function processInboundEvent(
  ctx: ServiceContext,
  eventId: string,
): Promise<void> {
  const [event] = await ctx.db
    .select()
    .from(inboundEvents)
    .where(eq(inboundEvents.id, eventId))
    .limit(1);

  if (!event || event.processingStatus === "processed") {
    return;
  }

  if (!event.socialAccountId || !event.organizationId) {
    await ctx.db
      .update(inboundEvents)
      .set({
        processingStatus: "ignored",
        errorMessage: "missing account",
        processedAt: new Date(),
      })
      .where(eq(inboundEvents.id, eventId));
    return;
  }

  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, event.socialAccountId))
    .limit(1);

  if (!account) {
    return;
  }

  const normalized = event.payloadJson as unknown as NormalizedChannelEvent;
  const events: NormalizedChannelEvent[] =
    normalized.type !== undefined
      ? [normalized]
      : await getChannelAdapter(event.provider, ctx.meta).normalizeEvent(
          event.payloadJson,
        );

  try {
    for (const item of events) {
      if (item.type === "comment.received" && item.comment) {
        const commentId = await persistComment(ctx, item, account);
        if (commentId) {
          await ctx.queue.add(QUEUE_MODERATION, { id: commentId });
        }
      } else if (
        (item.type === "message.received" || item.type === "message.sent") &&
        item.message
      ) {
        await persistMessage(ctx, item, account);
      }
    }

    await ctx.db
      .update(inboundEvents)
      .set({
        processingStatus: "processed",
        processedAt: new Date(),
      })
      .where(eq(inboundEvents.id, eventId));
  } catch (error) {
    await ctx.db
      .update(inboundEvents)
      .set({
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        processedAt: new Date(),
      })
      .where(eq(inboundEvents.id, eventId));
    throw error;
  }
}

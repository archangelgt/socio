import {
  ChannelProviderError,
  listInstagramMediaComments,
} from "@social-ai/channels";
import { brands, inboundEvents, socialAccounts } from "@social-ai/db";
import { type ClientAccess, QUEUE_INBOUND_EVENTS } from "@social-ai/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";
import { upsertSocialPost } from "./posts";
import { clientScopeIds } from "./scopes";

export async function syncInstagramComments(
  ctx: ServiceContext,
  organizationId: string,
  access: ClientAccess,
): Promise<{ ingested: number; seen: number }> {
  if (!ctx.meta) {
    throw new AppError(
      501,
      "META_NOT_CONFIGURED",
      "Set Meta credentials to sync Instagram comments.",
    );
  }

  const scope = clientScopeIds(access);
  const filters = [
    eq(socialAccounts.organizationId, organizationId),
    eq(socialAccounts.provider, "instagram"),
    eq(socialAccounts.status, "active"),
  ];
  if (scope !== null) {
    if (scope.length === 0) {
      return { ingested: 0, seen: 0 };
    }
    filters.push(inArray(brands.clientId, scope));
  }

  const accounts = await ctx.db
    .select({ account: socialAccounts })
    .from(socialAccounts)
    .innerJoin(brands, eq(brands.id, socialAccounts.brandId))
    .where(and(...filters));

  let ingested = 0;
  let seen = 0;

  for (const { account } of accounts) {
    let comments: Awaited<ReturnType<typeof listInstagramMediaComments>>;
    try {
      comments = await listInstagramMediaComments(ctx.meta, {
        accessToken: decryptSecret(account.accessTokenEncrypted, ctx.tokenKey),
        igUserId: account.externalAccountId,
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

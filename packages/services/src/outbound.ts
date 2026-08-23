import { ChannelProviderError } from "@social-ai/channels";
import { comments, moderationActions, socialAccounts } from "@social-ai/db";
import { QUEUE_OUTBOUND_ACTIONS } from "@social-ai/domain";
import { and, eq } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";

export async function enqueueOutboundAction(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    decisionId: string;
    commentId: string;
    socialAccountId: string;
    source: "policy" | "human";
    actionType: "hide" | "unhide" | "delete";
    provider: string;
  },
): Promise<void> {
  const [action] = await ctx.db
    .insert(moderationActions)
    .values({
      organizationId: input.organizationId,
      moderationDecisionId: input.decisionId,
      commentId: input.commentId,
      socialAccountId: input.socialAccountId,
      source: input.source,
      actionType: input.actionType,
      provider: input.provider,
      status: "queued",
    })
    .returning();

  if (!action) {
    throw new AppError(500, "ACTION_ENQUEUE_FAILED", "Could not queue action.");
  }

  await ctx.queue.add(QUEUE_OUTBOUND_ACTIONS, { id: action.id });
}

export async function processOutboundAction(
  ctx: ServiceContext,
  actionId: string,
): Promise<void> {
  const [action] = await ctx.db
    .select()
    .from(moderationActions)
    .where(eq(moderationActions.id, actionId))
    .limit(1);

  if (!action || action.status === "succeeded") {
    return;
  }

  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, action.commentId),
        eq(comments.organizationId, action.organizationId),
      ),
    )
    .limit(1);
  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, action.socialAccountId),
        eq(socialAccounts.organizationId, action.organizationId),
      ),
    )
    .limit(1);

  if (!comment || !account) {
    await ctx.db
      .update(moderationActions)
      .set({
        status: "failed",
        errorCode: "NOT_FOUND",
        errorMessage: "Comment or account missing",
      })
      .where(eq(moderationActions.id, actionId));
    return;
  }

  const adapter = getChannelAdapter(account.provider, ctx.meta);
  const capabilities = adapter.capabilities();
  const accessToken = decryptSecret(account.accessTokenEncrypted, ctx.tokenKey);
  const network = account.provider === "facebook" ? "facebook" : "instagram";

  try {
    if (action.actionType === "hide") {
      if (!capabilities.hideComments) {
        throw new AppError(
          400,
          "MODERATION_ACTION_NOT_SUPPORTED",
          "This channel does not support hiding comments.",
        );
      }
      const result = await adapter.hideComment({
        organizationId: action.organizationId,
        accountId: account.externalAccountId,
        externalCommentId: comment.externalCommentId,
        accessToken,
        network,
        externalPostId: comment.externalPostId,
        commentBody: comment.body,
        authorDisplayName: comment.authorDisplayName ?? undefined,
      });
      await ctx.db
        .update(comments)
        .set({ status: "hidden" })
        .where(
          and(
            eq(comments.id, comment.id),
            eq(comments.organizationId, action.organizationId),
          ),
        );
      if (
        result.externalCommentId &&
        result.externalCommentId !== comment.externalCommentId
      ) {
        try {
          await ctx.db
            .update(comments)
            .set({ externalCommentId: result.externalCommentId })
            .where(
              and(
                eq(comments.id, comment.id),
                eq(comments.organizationId, action.organizationId),
              ),
            );
        } catch {
          // Keep the original id if Graph already stored a row for it.
        }
      }
      await ctx.db
        .update(moderationActions)
        .set({
          status: "succeeded",
          externalActionId: result.externalActionId,
          executedAt: new Date(),
        })
        .where(eq(moderationActions.id, actionId));
    } else if (action.actionType === "unhide") {
      if (!capabilities.unhideComments) {
        throw new AppError(
          400,
          "MODERATION_ACTION_NOT_SUPPORTED",
          "This channel does not support restoring comments.",
        );
      }
      const result = await adapter.unhideComment({
        organizationId: action.organizationId,
        accountId: account.externalAccountId,
        externalCommentId: comment.externalCommentId,
        accessToken,
        network,
        externalPostId: comment.externalPostId,
        commentBody: comment.body,
        authorDisplayName: comment.authorDisplayName ?? undefined,
      });
      await ctx.db
        .update(comments)
        .set({ status: "visible" })
        .where(
          and(
            eq(comments.id, comment.id),
            eq(comments.organizationId, action.organizationId),
          ),
        );
      await ctx.db
        .update(moderationActions)
        .set({
          status: "succeeded",
          externalActionId: result.externalActionId,
          executedAt: new Date(),
        })
        .where(eq(moderationActions.id, actionId));
    } else {
      await ctx.db
        .update(moderationActions)
        .set({
          status: "skipped",
          errorCode: "UNSUPPORTED",
          errorMessage: `Action ${action.actionType} not implemented`,
        })
        .where(eq(moderationActions.id, actionId));
    }
  } catch (error) {
    const err =
      error instanceof AppError
        ? error
        : error instanceof ChannelProviderError
          ? { code: error.code, message: error.message }
          : undefined;
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.db
      .update(moderationActions)
      .set({
        status: "failed",
        errorCode: err?.code ?? "PROVIDER_ERROR",
        errorMessage: message,
      })
      .where(eq(moderationActions.id, actionId));
    await ctx.db
      .update(comments)
      .set({
        moderationStatus: "ACTION_FAILED",
        status: "visible",
      })
      .where(
        and(
          eq(comments.id, comment.id),
          eq(comments.organizationId, action.organizationId),
        ),
      );
    await writeAudit(ctx.db, {
      organizationId: action.organizationId,
      actorType: action.source === "policy" ? "ai_policy" : "user",
      eventType: `moderation.action.${action.actionType}`,
      entityType: "moderation_action",
      entityId: action.id,
    });
    throw new AppError(502, "CHANNEL_PROVIDER_ERROR", message);
  }

  await writeAudit(ctx.db, {
    organizationId: action.organizationId,
    actorType: action.source === "policy" ? "ai_policy" : "user",
    eventType: `moderation.action.${action.actionType}`,
    entityType: "moderation_action",
    entityId: action.id,
  });
}

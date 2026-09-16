import { comments, moderationActions, socialAccounts } from "@social-ai/db";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";
import { enqueueOutboundAction } from "./outbound";
import { suggestCommentReply } from "./suggest-reply";

export function readAutoReplyEnabled(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  return (metadata as { autoReplyEnabled?: unknown }).autoReplyEnabled === true;
}

export function withAutoReplyEnabled(
  metadata: unknown,
  enabled: boolean,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (enabled) {
    return { ...base, autoReplyEnabled: true };
  }
  const { autoReplyEnabled: _removed, ...rest } = base;
  return rest;
}

export async function setChannelAutoReply(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    channelId: string;
    enabled: boolean;
    /** When set, apply the same flag to sibling Meta accounts (same pageId). */
    applyToSiblingIds?: string[];
  },
): Promise<{
  id: string;
  autoReplyEnabled: boolean;
  updatedChannelIds: string[];
}> {
  const targetIds = Array.from(
    new Set([input.channelId, ...(input.applyToSiblingIds ?? [])]),
  );

  const rows = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, input.organizationId),
        inArray(socialAccounts.id, targetIds),
        eq(socialAccounts.status, "active"),
      ),
    );

  if (!rows.some((row) => row.id === input.channelId)) {
    throw new AppError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
  }

  const updatedChannelIds: string[] = [];
  for (const row of rows) {
    const [updated] = await ctx.db
      .update(socialAccounts)
      .set({
        metadataJson: withAutoReplyEnabled(row.metadataJson, input.enabled),
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, row.id))
      .returning({ id: socialAccounts.id });
    if (updated) {
      updatedChannelIds.push(updated.id);
    }
  }

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: input.enabled
      ? "channel.auto_reply_enabled"
      : "channel.auto_reply_disabled",
    entityType: "social_account",
    entityId: input.channelId,
    metadata: {
      enabled: input.enabled,
      updatedChannelIds,
    },
  });

  return {
    id: input.channelId,
    autoReplyEnabled: input.enabled,
    updatedChannelIds,
  };
}

/**
 * Opt-in per-account auto public reply. The account toggle is the human
 * authorization gate (ADR-026); AI still only drafts text and the outbound
 * bus posts it — the model never calls a channel adapter.
 */
export async function maybeAutoReplyToComment(
  ctx: ServiceContext,
  input: { organizationId: string; commentId: string },
): Promise<{ replied: boolean; reason?: string }> {
  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!comment) {
    return { replied: false, reason: "comment_not_found" };
  }

  if (comment.status === "hidden" || comment.status === "deleted") {
    return { replied: false, reason: "comment_not_visible" };
  }

  if (
    comment.moderationStatus === "AUTO_HIDDEN" ||
    comment.moderationStatus === "ACTION_FAILED"
  ) {
    return { replied: false, reason: "moderation_blocked" };
  }

  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, comment.socialAccountId),
        eq(socialAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!account || !readAutoReplyEnabled(account.metadataJson)) {
    return { replied: false, reason: "auto_reply_disabled" };
  }

  const existing = await ctx.db
    .select({ id: moderationActions.id })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.organizationId, input.organizationId),
        eq(moderationActions.commentId, comment.id),
        eq(moderationActions.actionType, "reply"),
        inArray(moderationActions.status, ["queued", "succeeded"]),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { replied: false, reason: "already_replied" };
  }

  let suggestion: { text: string; provider: string; model: string };
  try {
    suggestion = await suggestCommentReply(ctx, {
      organizationId: input.organizationId,
      actorId: "system:auto-reply",
      commentId: comment.id,
    });
  } catch (error) {
    await writeAudit(ctx.db, {
      organizationId: input.organizationId,
      actorType: "ai_policy",
      eventType: "moderation.auto_reply_failed",
      entityType: "comment",
      entityId: comment.id,
      metadata: {
        error: error instanceof Error ? error.message : "suggest_failed",
      },
    });
    return { replied: false, reason: "suggest_failed" };
  }

  const text = suggestion.text.trim();
  if (!text) {
    return { replied: false, reason: "empty_suggestion" };
  }

  await enqueueOutboundAction(ctx, {
    organizationId: input.organizationId,
    decisionId: null,
    commentId: comment.id,
    socialAccountId: comment.socialAccountId,
    source: "policy",
    actionType: "reply",
    provider: account.provider,
    payload: { text, auto: true },
  });

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "ai_policy",
    eventType: "moderation.auto_replied",
    entityType: "comment",
    entityId: comment.id,
    metadata: {
      provider: suggestion.provider,
      model: suggestion.model,
      textLength: text.length,
    },
  });

  return { replied: true };
}

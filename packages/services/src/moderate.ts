import {
  type Database,
  brands,
  comments,
  moderationDecisions,
  moderationPolicies,
  moderationRules,
  posts,
  socialAccounts,
  usageEvents,
} from "@social-ai/db";
import {
  type ModerationAction,
  type ModerationCategory,
  type ModerationRule,
  QUEUE_STATES,
  type QueueState,
} from "@social-ai/domain";
import {
  evaluateModerationPolicy,
  parseModerationResult,
} from "@social-ai/moderation";
import { and, desc, eq } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";
import { enqueueOutboundAction } from "./outbound";
import { thumbnailFromMetadata } from "./posts";

async function failModeration(
  ctx: ServiceContext,
  comment: { id: string; organizationId: string },
  eventType: string,
) {
  await ctx.db
    .update(comments)
    .set({ moderationStatus: "REVIEW_REQUIRED" })
    .where(
      and(
        eq(comments.id, comment.id),
        eq(comments.organizationId, comment.organizationId),
      ),
    );
  await writeAudit(ctx.db, {
    organizationId: comment.organizationId,
    actorType: "system",
    eventType,
    entityType: "comment",
    entityId: comment.id,
  });
}

export async function processModeration(
  ctx: ServiceContext,
  commentId: string,
): Promise<void> {
  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) {
    return;
  }

  const [post] = comment.postId
    ? await ctx.db
        .select()
        .from(posts)
        .where(eq(posts.id, comment.postId))
        .limit(1)
    : [];

  const [brand] = await ctx.db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, comment.brandId),
        eq(brands.organizationId, comment.organizationId),
      ),
    )
    .limit(1);

  const started = Date.now();
  let raw: unknown;
  try {
    raw = await ctx.ai.moderate({
      organizationId: comment.organizationId,
      text: comment.body,
      brandName: brand?.name,
      postText: post?.body ?? undefined,
    });
  } catch {
    await failModeration(ctx, comment, "moderation.provider_failure");
    return;
  }

  let result: ReturnType<typeof parseModerationResult>;
  try {
    result = parseModerationResult(raw);
  } catch {
    await failModeration(ctx, comment, "moderation.invalid_output");
    return;
  }

  const [policy] = await ctx.db
    .select()
    .from(moderationPolicies)
    .where(
      and(
        eq(moderationPolicies.brandId, comment.brandId),
        eq(moderationPolicies.organizationId, comment.organizationId),
        eq(moderationPolicies.enabled, true),
      ),
    )
    .limit(1);

  const ruleRows = policy
    ? await ctx.db
        .select()
        .from(moderationRules)
        .where(eq(moderationRules.moderationPolicyId, policy.id))
    : [];

  const rules: ModerationRule[] = ruleRows.map((row) => ({
    category: row.category as ModerationCategory,
    minimum_severity: row.minimumSeverity,
    minimum_confidence: row.minimumConfidence,
    action: row.action,
    require_human: row.requireHuman,
    enabled: row.enabled,
  }));

  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, comment.socialAccountId))
    .limit(1);

  const adapter = getChannelAdapter(account?.provider ?? "mock", ctx.meta);
  const capabilities = adapter.capabilities();

  const decision = evaluateModerationPolicy({
    result,
    rules,
    policyConfidenceThreshold: policy?.confidenceThreshold ?? 0.9,
    capabilities: {
      hideComments: capabilities.hideComments,
      unhideComments: capabilities.unhideComments,
      deleteComments: capabilities.deleteComments,
    },
  });

  const [saved] = await ctx.db
    .insert(moderationDecisions)
    .values({
      organizationId: comment.organizationId,
      brandId: comment.brandId,
      commentId: comment.id,
      policyId: policy?.id,
      policyVersion: policy?.id,
      provider: ctx.ai.provider,
      model: ctx.ai.model,
      categoriesJson: result.categories,
      severity: result.severity,
      confidence: result.overall_confidence,
      rationale: decision.reason,
      recommendedAction: result.recommended_action,
      finalAction: decision.action,
      status: decision.queueState,
    })
    .returning();

  await ctx.db
    .update(comments)
    .set({
      moderationStatus: decision.queueState,
      severity: result.severity,
      aiConfidence: result.overall_confidence,
    })
    .where(
      and(
        eq(comments.id, comment.id),
        eq(comments.organizationId, comment.organizationId),
      ),
    );

  await ctx.db.insert(usageEvents).values({
    organizationId: comment.organizationId,
    provider: ctx.ai.provider,
    model: ctx.ai.model,
    action: "moderate",
    latencyMs: Date.now() - started,
  });

  await writeAudit(ctx.db, {
    organizationId: comment.organizationId,
    actorType: "ai_policy",
    eventType: "moderation.decided",
    entityType: "moderation_decision",
    entityId: saved?.id,
    metadata: {
      commentId: comment.id,
      status: decision.queueState,
      reason: decision.reason,
    },
  });

  if (
    decision.queueState === "AUTO_HIDDEN" &&
    decision.action === "HIDE" &&
    saved
  ) {
    await enqueueOutboundAction(ctx, {
      organizationId: comment.organizationId,
      decisionId: saved.id,
      commentId: comment.id,
      socialAccountId: comment.socialAccountId,
      source: "policy",
      actionType: "hide",
      provider: account?.provider ?? "mock",
    });
  }
}

export async function listModerationQueue(
  db: Database,
  organizationId: string,
  status?: string,
) {
  const filters = [
    eq(moderationDecisions.organizationId, organizationId),
    eq(comments.organizationId, organizationId),
  ];
  if (status && (QUEUE_STATES as readonly string[]).includes(status)) {
    filters.push(eq(comments.moderationStatus, status as QueueState));
  }

  const rows = await db
    .select({
      decisionId: moderationDecisions.id,
      commentId: comments.id,
      body: comments.body,
      authorDisplayName: comments.authorDisplayName,
      commentStatus: comments.status,
      moderationStatus: comments.moderationStatus,
      severity: comments.severity,
      confidence: comments.aiConfidence,
      recommendedAction: moderationDecisions.recommendedAction,
      finalAction: moderationDecisions.finalAction,
      rationale: moderationDecisions.rationale,
      createdAt: comments.createdAt,
      postId: comments.postId,
      postBody: posts.body,
      postPermalink: posts.permalink,
      postMetadata: posts.metadataJson,
    })
    .from(moderationDecisions)
    .innerJoin(comments, eq(comments.id, moderationDecisions.commentId))
    .leftJoin(posts, eq(posts.id, comments.postId))
    .where(and(...filters))
    .orderBy(desc(moderationDecisions.createdAt))
    .limit(100);

  return rows.map((row) => ({
    decisionId: row.decisionId,
    commentId: row.commentId,
    body: row.body,
    authorDisplayName: row.authorDisplayName,
    commentStatus: row.commentStatus,
    moderationStatus: row.moderationStatus,
    severity: row.severity,
    confidence: row.confidence,
    recommendedAction: row.recommendedAction,
    finalAction: row.finalAction,
    rationale: row.rationale,
    createdAt: row.createdAt,
    postId: row.postId,
    postBody: row.postBody,
    postPermalink: row.postPermalink,
    postThumbnailUrl: thumbnailFromMetadata(row.postMetadata),
  }));
}

export async function humanModerate(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    decisionId: string;
    action: "allow" | "hide" | "restore";
  },
) {
  const [decision] = await ctx.db
    .select()
    .from(moderationDecisions)
    .where(
      and(
        eq(moderationDecisions.id, input.decisionId),
        eq(moderationDecisions.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!decision) {
    throw new AppError(
      404,
      "DECISION_NOT_FOUND",
      "Moderation decision not found.",
    );
  }

  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, decision.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!comment) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }

  if (input.action === "allow" || input.action === "restore") {
    const nextStatus = input.action === "restore" ? "OVERRIDDEN" : "APPROVED";
    await ctx.db
      .update(moderationDecisions)
      .set({
        status: nextStatus,
        finalAction: "ALLOW",
      })
      .where(eq(moderationDecisions.id, decision.id));
    await ctx.db
      .update(comments)
      .set({
        moderationStatus: nextStatus,
        status: "visible",
      })
      .where(
        and(
          eq(comments.id, comment.id),
          eq(comments.organizationId, input.organizationId),
        ),
      );

    if (input.action === "restore" && comment.status === "hidden") {
      await enqueueOutboundAction(ctx, {
        organizationId: input.organizationId,
        decisionId: decision.id,
        commentId: comment.id,
        socialAccountId: comment.socialAccountId,
        source: "human",
        actionType: "unhide",
        provider: "mock",
      });
    }

    await writeAudit(ctx.db, {
      organizationId: input.organizationId,
      actorType: "user",
      actorId: input.actorId,
      eventType:
        input.action === "restore"
          ? "moderation.restored"
          : "moderation.allowed",
      entityType: "moderation_decision",
      entityId: decision.id,
    });
    return;
  }

  await ctx.db
    .update(moderationDecisions)
    .set({
      status: "APPROVED",
      finalAction: "HIDE" satisfies ModerationAction,
    })
    .where(eq(moderationDecisions.id, decision.id));
  await ctx.db
    .update(comments)
    .set({
      moderationStatus: "APPROVED",
      status: "hidden",
    })
    .where(
      and(
        eq(comments.id, comment.id),
        eq(comments.organizationId, input.organizationId),
      ),
    );

  await enqueueOutboundAction(ctx, {
    organizationId: input.organizationId,
    decisionId: decision.id,
    commentId: comment.id,
    socialAccountId: comment.socialAccountId,
    source: "human",
    actionType: "hide",
    provider: "mock",
  });

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "moderation.hidden",
    entityType: "moderation_decision",
    entityId: decision.id,
  });
}

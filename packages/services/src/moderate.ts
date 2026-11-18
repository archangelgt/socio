import {
  type Database,
  brands,
  clients,
  comments,
  moderationDecisions,
  moderationPolicies,
  moderationRules,
  posts,
  socialAccounts,
  usageEvents,
} from "@social-ai/db";
import {
  type ClientAccess,
  type ModerationAction,
  type ModerationCategory,
  type ModerationRule,
  QUEUE_STATES,
  type QueueState,
  URGENCIES,
  type Urgency,
  caseKindFromCategories,
  computeUrgency,
  effectiveUrgency,
} from "@social-ai/domain";
import {
  evaluateModerationPolicy,
  parseModerationResult,
} from "@social-ai/moderation";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";
import { enqueueOutboundAction } from "./outbound";
import { thumbnailFromMetadata } from "./posts";
import { assertClientAllowed, clientScopeIds } from "./scopes";

function publicProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown error";
  return raw.replace(/sk-[a-zA-Z0-9_-]+/gi, "sk-***").slice(0, 300);
}

async function insertFallbackDecision(
  db: Database,
  comment: { id: string; organizationId: string; brandId: string },
  input: { provider: string; model: string; rationale: string },
) {
  const [existing] = await db
    .select({ id: moderationDecisions.id })
    .from(moderationDecisions)
    .where(eq(moderationDecisions.commentId, comment.id))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [saved] = await db
    .insert(moderationDecisions)
    .values({
      organizationId: comment.organizationId,
      brandId: comment.brandId,
      commentId: comment.id,
      provider: input.provider,
      model: input.model,
      categoriesJson: [{ name: "other", confidence: 0 }],
      severity: "NONE",
      confidence: 0,
      rationale: input.rationale,
      recommendedAction: "FLAG",
      finalAction: "FLAG",
      status: "REVIEW_REQUIRED",
    })
    .returning();
  return saved;
}

async function failModeration(
  ctx: ServiceContext,
  comment: { id: string; organizationId: string; brandId: string },
  eventType: string,
  error?: unknown,
) {
  const rationale = `AI unavailable: ${publicProviderError(error)}`;
  console.error("moderation failed", {
    commentId: comment.id,
    eventType,
    error: publicProviderError(error),
  });
  await insertFallbackDecision(ctx.db, comment, {
    provider: ctx.ai.provider,
    model: ctx.ai.model,
    rationale,
  });
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
    metadata: { error: publicProviderError(error) },
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
  } catch (error) {
    await failModeration(ctx, comment, "moderation.provider_failure", error);
    return;
  }

  let result: ReturnType<typeof parseModerationResult>;
  try {
    result = parseModerationResult(raw);
  } catch (error) {
    await failModeration(ctx, comment, "moderation.invalid_output", error);
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

  let decision = evaluateModerationPolicy({
    result,
    rules,
    policyConfidenceThreshold: policy?.confidenceThreshold ?? 0.9,
    capabilities: {
      hideComments: capabilities.hideComments,
      unhideComments: capabilities.unhideComments,
      deleteComments: capabilities.deleteComments,
    },
  });

  const [clientRow] = brand?.clientId
    ? await ctx.db
        .select({ crisisMode: clients.crisisMode })
        .from(clients)
        .where(eq(clients.id, brand.clientId))
        .limit(1)
    : [];

  if (
    clientRow?.crisisMode &&
    decision.queueState === "AUTO_HIDDEN" &&
    decision.action === "HIDE"
  ) {
    decision = {
      ...decision,
      action: "FLAG",
      queueState: "REVIEW_REQUIRED",
      reason: `${decision.reason} Crisis mode: auto-hide paused.`,
    };
  }

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

  const urgency = computeUrgency({
    severity: result.severity,
    categories: result.categories,
  });
  const caseKind = caseKindFromCategories(result.categories);

  await ctx.db
    .update(comments)
    .set({
      moderationStatus: decision.queueState,
      severity: result.severity,
      urgency,
      caseKind,
      attentionDueAt:
        caseKind === "complaint" || caseKind === "scam"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null,
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
      crisisMode: Boolean(clientRow?.crisisMode),
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
  access: ClientAccess,
  status?: string,
  clientId?: string,
) {
  const scope = clientScopeIds(access);
  const orphanFilters = [
    eq(comments.organizationId, organizationId),
    inArray(comments.moderationStatus, ["PENDING", "REVIEW_REQUIRED"]),
    isNull(moderationDecisions.id),
  ];
  if (clientId) {
    if (scope !== null && !scope.includes(clientId)) {
      return [];
    }
    orphanFilters.push(eq(brands.clientId, clientId));
  } else if (scope !== null) {
    if (scope.length === 0) {
      return [];
    }
    orphanFilters.push(inArray(brands.clientId, scope));
  }

  const orphans = await db
    .select({
      id: comments.id,
      organizationId: comments.organizationId,
      brandId: comments.brandId,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .leftJoin(
      moderationDecisions,
      eq(moderationDecisions.commentId, comments.id),
    )
    .where(and(...orphanFilters));

  for (const orphan of orphans) {
    await insertFallbackDecision(db, orphan, {
      provider: "system",
      model: "unavailable",
      rationale: "AI unavailable; queued for human review.",
    });
  }

  const filters = [
    eq(moderationDecisions.organizationId, organizationId),
    eq(comments.organizationId, organizationId),
  ];
  if (clientId) {
    filters.push(eq(brands.clientId, clientId));
  } else if (scope !== null) {
    filters.push(inArray(brands.clientId, scope));
  }
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
      urgency: comments.urgency,
      urgencyOverride: comments.urgencyOverride,
      urgencyReason: comments.urgencyReason,
      caseKind: comments.caseKind,
      assignedUserId: comments.assignedUserId,
      attentionDueAt: comments.attentionDueAt,
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
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .leftJoin(posts, eq(posts.id, comments.postId))
    .where(and(...filters))
    .orderBy(
      sql`case coalesce(${comments.urgencyOverride}, ${comments.urgency})
        when 'RED' then 0 when 'YELLOW' then 1 else 2 end`,
      desc(moderationDecisions.createdAt),
    )
    .limit(100);

  return rows.map((row) => {
    const urgency = effectiveUrgency(row.urgency, row.urgencyOverride);
    return {
      decisionId: row.decisionId,
      commentId: row.commentId,
      body: row.body,
      authorDisplayName: row.authorDisplayName,
      commentStatus: row.commentStatus,
      moderationStatus: row.moderationStatus,
      severity: row.severity,
      urgency,
      urgencyReason: row.urgencyReason,
      caseKind: row.caseKind,
      assignedUserId: row.assignedUserId,
      attentionDueAt: row.attentionDueAt,
      confidence: row.confidence,
      recommendedAction: row.recommendedAction,
      finalAction: row.finalAction,
      rationale: row.rationale,
      createdAt: row.createdAt,
      postId: row.postId,
      postBody: row.postBody,
      postPermalink: row.postPermalink,
      postThumbnailUrl: thumbnailFromMetadata(row.postMetadata),
    };
  });
}

export async function overrideCommentUrgency(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    access: ClientAccess;
    commentId: string;
    urgency: string;
    reason: string;
  },
) {
  if (!(URGENCIES as readonly string[]).includes(input.urgency)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid urgency.");
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new AppError(400, "VALIDATION_ERROR", "Reason is required.");
  }

  const [comment] = await db
    .select({
      id: comments.id,
      brandId: comments.brandId,
      clientId: brands.clientId,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!comment) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }
  assertClientAllowed(input.access, comment.clientId);

  await db
    .update(comments)
    .set({
      urgencyOverride: input.urgency as Urgency,
      urgencyReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, comment.id));

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "moderation.urgency_overridden",
    entityType: "comment",
    entityId: comment.id,
    metadata: { urgency: input.urgency, reason },
  });

  return {
    commentId: comment.id,
    urgency: input.urgency,
    reason,
  };
}

export async function humanModerate(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    decisionId: string;
    action: "allow" | "hide" | "restore";
    access: ClientAccess;
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
    .select({
      id: comments.id,
      brandId: comments.brandId,
      socialAccountId: comments.socialAccountId,
      status: comments.status,
      clientId: brands.clientId,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
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
  assertClientAllowed(input.access, comment.clientId);

  const [account] = await ctx.db
    .select({
      id: socialAccounts.id,
      provider: socialAccounts.provider,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, comment.socialAccountId),
        eq(socialAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const accountProvider = account?.provider ?? "instagram";

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
        provider: accountProvider,
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
    provider: accountProvider,
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

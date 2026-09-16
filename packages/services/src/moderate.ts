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
import type {
  ModerationAction,
  ModerationCategory,
  ModerationRule,
} from "@social-ai/domain";
import {
  evaluateModerationPolicy,
  parseModerationResult,
} from "@social-ai/moderation";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { InboxListFilters } from "./account-filter";
import { resolveInboxAccountIds } from "./account-filter";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import { maybeAutoReplyToComment } from "./auto-reply";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";
import {
  type ModerationQueueQuery,
  escapeLikePattern,
  resolveQueueOrder,
  resolveQueuePage,
  resolveQueuePageSize,
  resolveQueueSeverity,
  resolveQueueSort,
  resolveQueueStatuses,
} from "./moderation-queue-query";
import { enqueueOutboundAction } from "./outbound";
import { thumbnailFromMetadata } from "./posts";

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

  const decision = evaluateModerationPolicy({
    result,
    rules,
    policyConfidenceThreshold: policy?.confidenceThreshold ?? 0.65,
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
    return;
  }

  if (decision.queueState === "AUTO_ALLOWED") {
    await maybeAutoReplyToComment(ctx, {
      organizationId: comment.organizationId,
      commentId: comment.id,
    });
  }
}

export async function listModerationQueue(
  db: Database,
  organizationId: string,
  options: ModerationQueueQuery & InboxListFilters = {},
) {
  const {
    status,
    severity,
    q,
    sort,
    order,
    page: pageInput,
    pageSize: pageSizeInput,
    socialAccountId,
    brandId,
  } = options;
  const page = resolveQueuePage(pageInput);
  const pageSize = resolveQueuePageSize(pageSizeInput);
  const statuses = resolveQueueStatuses(status);
  const severityFilter = resolveQueueSeverity(severity);
  const sortField = resolveQueueSort(sort);
  const sortOrder = resolveQueueOrder(order);
  const accountIds = await resolveInboxAccountIds(db, organizationId, {
    socialAccountId,
    brandId,
  });

  if (brandId) {
    const [brand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(eq(brands.id, brandId), eq(brands.organizationId, organizationId)),
      )
      .limit(1);
    if (!brand) {
      throw new AppError(
        404,
        "BRAND_NOT_FOUND",
        "Brand not found in this workspace.",
      );
    }
  }

  const orphanFilters = [
    eq(comments.organizationId, organizationId),
    inArray(comments.moderationStatus, ["PENDING", "REVIEW_REQUIRED"]),
    isNull(moderationDecisions.id),
  ];
  if (accountIds && accountIds.length > 0) {
    orphanFilters.push(inArray(comments.socialAccountId, accountIds));
  }
  if (brandId) {
    orphanFilters.push(eq(comments.brandId, brandId));
  }

  const orphans = await db
    .select({
      id: comments.id,
      organizationId: comments.organizationId,
      brandId: comments.brandId,
    })
    .from(comments)
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
  if (statuses && statuses.length > 0) {
    filters.push(inArray(comments.moderationStatus, statuses));
  }
  if (severityFilter) {
    filters.push(eq(comments.severity, severityFilter));
  }
  if (accountIds && accountIds.length > 0) {
    filters.push(inArray(comments.socialAccountId, accountIds));
  }
  if (brandId) {
    filters.push(eq(comments.brandId, brandId));
  }
  const queryText = q?.trim();
  if (queryText) {
    const pattern = `%${escapeLikePattern(queryText)}%`;
    const searchClause = or(
      ilike(comments.body, pattern),
      ilike(comments.authorDisplayName, pattern),
      ilike(socialAccounts.displayName, pattern),
      ilike(brands.name, pattern),
    );
    if (searchClause) {
      filters.push(searchClause);
    }
  }

  const severityOrder = sql`case ${comments.severity}
    when 'NONE' then 0
    when 'LOW' then 1
    when 'MEDIUM' then 2
    when 'HIGH' then 3
    when 'CRITICAL' then 4
    else -1 end`;

  const orderExpr = (() => {
    const direction = sortOrder === "asc" ? asc : desc;
    switch (sortField) {
      case "severity":
        return direction(severityOrder);
      case "confidence":
        return direction(comments.aiConfidence);
      case "status":
        return direction(comments.moderationStatus);
      case "author":
        return direction(comments.authorDisplayName);
      default:
        return direction(comments.createdAt);
    }
  })();

  const baseQuery = db
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
      socialAccountId: comments.socialAccountId,
      brandId: comments.brandId,
      accountDisplayName: socialAccounts.displayName,
      provider: socialAccounts.provider,
      brandName: brands.name,
    })
    .from(moderationDecisions)
    .innerJoin(comments, eq(comments.id, moderationDecisions.commentId))
    .leftJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, comments.socialAccountId))
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(and(...filters));

  const [totalRow] = await db
    .select({ total: count() })
    .from(moderationDecisions)
    .innerJoin(comments, eq(comments.id, moderationDecisions.commentId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, comments.socialAccountId))
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(and(...filters));

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const rows = await baseQuery
    .orderBy(orderExpr, desc(moderationDecisions.id))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  return {
    items: rows.map((row) => ({
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
      socialAccountId: row.socialAccountId,
      brandId: row.brandId,
      accountDisplayName: row.accountDisplayName,
      provider: row.provider,
      brandName: row.brandName,
    })),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
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

    await maybeAutoReplyToComment(ctx, {
      organizationId: input.organizationId,
      commentId: comment.id,
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

export async function humanReplyToComment(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    commentId: string;
    text: string;
  },
) {
  const text = input.text.trim();
  if (!text) {
    throw new AppError(400, "REPLY_TEXT_REQUIRED", "Reply text is required.");
  }
  if (text.length > 2000) {
    throw new AppError(
      400,
      "REPLY_TEXT_TOO_LONG",
      "Reply text must be 2000 characters or fewer.",
    );
  }

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
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }

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

  if (!account) {
    throw new AppError(
      404,
      "ACCOUNT_NOT_FOUND",
      "Social account not found for this comment.",
    );
  }

  const adapter = getChannelAdapter(account.provider, ctx.meta);
  if (!adapter.capabilities().replyToComments) {
    throw new AppError(
      400,
      "MODERATION_ACTION_NOT_SUPPORTED",
      "This channel does not support replying to comments.",
    );
  }

  const [decision] = await ctx.db
    .select({ id: moderationDecisions.id })
    .from(moderationDecisions)
    .where(
      and(
        eq(moderationDecisions.commentId, comment.id),
        eq(moderationDecisions.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(moderationDecisions.createdAt))
    .limit(1);

  await enqueueOutboundAction(ctx, {
    organizationId: input.organizationId,
    decisionId: decision?.id ?? null,
    commentId: comment.id,
    socialAccountId: comment.socialAccountId,
    source: "human",
    actionType: "reply",
    provider: account.provider,
    payload: { text },
  });

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "moderation.replied",
    entityType: "comment",
    entityId: comment.id,
    metadata: { textLength: text.length },
  });
}

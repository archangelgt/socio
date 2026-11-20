import {
  type Database,
  brands,
  comments,
  moderationActions,
} from "@social-ai/db";
import type { ClientAccess } from "@social-ai/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import { clientScopeIds } from "./scopes";

/**
 * Thin V1 moderation metrics (docs/14_API_CONTRACTS.md).
 * False positives ≈ human OVERRIDDEN (restore after auto-hide).
 */
export async function getModerationMetrics(
  db: Database,
  organizationId: string,
  access: ClientAccess,
  clientId?: string,
) {
  const scope = clientScopeIds(access);
  const filters = [eq(comments.organizationId, organizationId)];
  if (clientId) {
    if (scope !== null && !scope.includes(clientId)) {
      return emptyMetrics();
    }
    filters.push(eq(brands.clientId, clientId));
  } else if (scope !== null) {
    if (scope.length === 0) {
      return emptyMetrics();
    }
    filters.push(inArray(brands.clientId, scope));
  }

  const [counts] = await db
    .select({
      analyzed: sql<number>`count(*)::int`,
      allowed: sql<number>`count(*) filter (where ${comments.moderationStatus} in ('APPROVED', 'AUTO_ALLOWED'))::int`,
      autoHidden: sql<number>`count(*) filter (where ${comments.moderationStatus} = 'AUTO_HIDDEN')::int`,
      reviewRequired: sql<number>`count(*) filter (where ${comments.moderationStatus} = 'REVIEW_REQUIRED')::int`,
      pending: sql<number>`count(*) filter (where ${comments.moderationStatus} = 'PENDING')::int`,
      overridden: sql<number>`count(*) filter (where ${comments.moderationStatus} = 'OVERRIDDEN')::int`,
      casesOpen: sql<number>`count(*) filter (where ${comments.caseKind} <> 'none')::int`,
      redUrgency: sql<number>`count(*) filter (where coalesce(${comments.urgencyOverride}, ${comments.urgency}) = 'RED')::int`,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(and(...filters));

  const bySeverity = await db
    .select({
      severity: comments.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(and(...filters))
    .groupBy(comments.severity)
    .orderBy(sql`count(*) desc`);

  const [actionCounts] = await db
    .select({
      failures: sql<number>`count(*) filter (where ${moderationActions.status} = 'failed')::int`,
      succeeded: sql<number>`count(*) filter (where ${moderationActions.status} = 'succeeded')::int`,
    })
    .from(moderationActions)
    .where(eq(moderationActions.organizationId, organizationId));

  return {
    analyzed: counts?.analyzed ?? 0,
    allowed: counts?.allowed ?? 0,
    autoHidden: counts?.autoHidden ?? 0,
    reviewRequired: counts?.reviewRequired ?? 0,
    pending: counts?.pending ?? 0,
    overridden: counts?.overridden ?? 0,
    falsePositives: counts?.overridden ?? 0,
    actionFailures: actionCounts?.failures ?? 0,
    actionSucceeded: actionCounts?.succeeded ?? 0,
    casesOpen: counts?.casesOpen ?? 0,
    redUrgency: counts?.redUrgency ?? 0,
    byCategory: bySeverity.map((row) => ({
      category: row.severity ?? "unknown",
      count: row.count,
    })),
  };
}

function emptyMetrics() {
  return {
    analyzed: 0,
    allowed: 0,
    autoHidden: 0,
    reviewRequired: 0,
    pending: 0,
    overridden: 0,
    falsePositives: 0,
    actionFailures: 0,
    actionSucceeded: 0,
    casesOpen: 0,
    redUrgency: 0,
    byCategory: [] as { category: string; count: number }[],
  };
}

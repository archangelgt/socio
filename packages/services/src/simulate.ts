import {
  brands,
  clients,
  moderationPolicies,
  moderationRules,
} from "@social-ai/db";
import type {
  ClientAccess,
  MembershipRole,
  ModerationCategory,
  ModerationRule,
} from "@social-ai/domain";
import { roleAtLeast } from "@social-ai/domain";
import {
  evaluateModerationPolicy,
  parseModerationResult,
} from "@social-ai/moderation";
import { and, eq } from "drizzle-orm";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

/**
 * Run AI + policy on sample texts without writing comments or outbound actions.
 */
export async function simulateModerationPolicy(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    brandId?: string;
    samples: string[];
    /** Optional alternate confidence threshold to compare. */
    proposedThreshold?: number;
  },
) {
  if (!roleAtLeast(input.role, "MANAGER")) {
    throw new AppError(403, "FORBIDDEN", "MANAGER+ can run simulations.");
  }
  assertClientAllowed(input.access, input.clientId);
  if (input.samples.length === 0 || input.samples.length > 20) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Provide 1–20 sample comments.",
    );
  }

  const [client] = await ctx.db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.id, input.clientId),
        eq(clients.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!client) {
    throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found.");
  }

  let brandName = client.name;
  let brandId = input.brandId;
  if (!brandId) {
    const [brand] = await ctx.db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(
        and(
          eq(brands.organizationId, input.organizationId),
          eq(brands.clientId, input.clientId),
        ),
      )
      .limit(1);
    brandId = brand?.id;
    brandName = brand?.name ?? client.name;
  }

  const [policy] = brandId
    ? await ctx.db
        .select()
        .from(moderationPolicies)
        .where(
          and(
            eq(moderationPolicies.brandId, brandId),
            eq(moderationPolicies.organizationId, input.organizationId),
            eq(moderationPolicies.enabled, true),
          ),
        )
        .limit(1)
    : [];

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

  const currentThreshold = policy?.confidenceThreshold ?? 0.9;
  const proposedThreshold = input.proposedThreshold ?? currentThreshold;

  const results = [];
  for (const text of input.samples) {
    const raw = await ctx.ai.moderate({
      organizationId: input.organizationId,
      text,
      brandName,
    });
    const result = parseModerationResult(raw);
    const current = evaluateModerationPolicy({
      result,
      rules,
      policyConfidenceThreshold: currentThreshold,
      capabilities: {
        hideComments: true,
        unhideComments: true,
        deleteComments: false,
      },
    });
    const proposed = evaluateModerationPolicy({
      result,
      rules,
      policyConfidenceThreshold: proposedThreshold,
      capabilities: {
        hideComments: true,
        unhideComments: true,
        deleteComments: false,
      },
    });
    results.push({
      text,
      severity: result.severity,
      categories: result.categories,
      confidence: result.overall_confidence,
      current: {
        action: current.action,
        queueState: current.queueState,
        reason: current.reason,
      },
      proposed: {
        action: proposed.action,
        queueState: proposed.queueState,
        reason: proposed.reason,
      },
      changed: current.queueState !== proposed.queueState,
    });
  }

  return {
    brandName,
    currentThreshold,
    proposedThreshold,
    results,
    changedCount: results.filter((item) => item.changed).length,
  };
}

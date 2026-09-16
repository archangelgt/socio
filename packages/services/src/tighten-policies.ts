import {
  type Database,
  moderationPolicies,
  moderationRules,
} from "@social-ai/db";
import {
  DEFAULT_POLICY_CONFIDENCE_THRESHOLD,
  defaultModerationRules,
} from "@social-ai/moderation";
import { and, eq } from "drizzle-orm";

/**
 * Push stricter V1 defaults onto existing org policies (ADR-027).
 * Idempotent: overwrites policy threshold + upserts default rule floors.
 */
export async function tightenExistingModerationPolicies(
  db: Database,
): Promise<{ policies: number; rulesUpserted: number }> {
  const policies = await db
    .update(moderationPolicies)
    .set({
      confidenceThreshold: DEFAULT_POLICY_CONFIDENCE_THRESHOLD,
      updatedAt: new Date(),
    })
    .returning({
      id: moderationPolicies.id,
      organizationId: moderationPolicies.organizationId,
    });

  const defaults = defaultModerationRules();
  let rulesUpserted = 0;

  for (const policy of policies) {
    for (const rule of defaults) {
      const updated = await db
        .update(moderationRules)
        .set({
          minimumSeverity: rule.minimum_severity,
          minimumConfidence: rule.minimum_confidence,
          action: rule.action,
          requireHuman: rule.require_human,
          enabled: rule.enabled,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(moderationRules.moderationPolicyId, policy.id),
            eq(moderationRules.category, rule.category),
          ),
        )
        .returning({ id: moderationRules.id });

      if (updated.length > 0) {
        rulesUpserted += updated.length;
        continue;
      }

      await db.insert(moderationRules).values({
        organizationId: policy.organizationId,
        moderationPolicyId: policy.id,
        category: rule.category,
        minimumSeverity: rule.minimum_severity,
        minimumConfidence: rule.minimum_confidence,
        action: rule.action,
        requireHuman: rule.require_human,
        enabled: rule.enabled,
      });
      rulesUpserted += 1;
    }
  }

  return { policies: policies.length, rulesUpserted };
}

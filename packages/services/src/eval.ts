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

export type EvalCase = {
  text: string;
  /** Human label: should the comment be hidden? */
  expectHide: boolean;
  /** Optional regional note (GT/CA fixture tag). */
  locale?: string;
};

/**
 * RF-21 — labeled dry-run eval (no outbound). Computes FP/FN vs current policy.
 */
export async function evaluateModerationSamples(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    brandId?: string;
    cases: EvalCase[];
  },
) {
  if (!roleAtLeast(input.role, "MANAGER")) {
    throw new AppError(403, "FORBIDDEN", "MANAGER+ can run evals.");
  }
  assertClientAllowed(input.access, input.clientId);
  if (input.cases.length === 0 || input.cases.length > 40) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Provide 1–40 labeled samples.",
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

  const threshold = policy?.confidenceThreshold ?? 0.9;
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  const results = [];
  for (const sample of input.cases) {
    const raw = await ctx.ai.moderate({
      organizationId: input.organizationId,
      text: sample.text,
      brandName,
    });
    const result = parseModerationResult(raw);
    const decision = evaluateModerationPolicy({
      result,
      rules,
      policyConfidenceThreshold: threshold,
      capabilities: {
        hideComments: true,
        unhideComments: true,
        deleteComments: false,
      },
    });
    const predictedHide =
      decision.action === "HIDE" || decision.queueState === "AUTO_HIDDEN";
    const expected = sample.expectHide;

    if (predictedHide && expected) {
      truePositive += 1;
    } else if (!predictedHide && !expected) {
      trueNegative += 1;
    } else if (predictedHide && !expected) {
      falsePositive += 1;
    } else {
      falseNegative += 1;
    }

    results.push({
      text: sample.text,
      locale: sample.locale ?? null,
      expectHide: expected,
      predictedHide,
      queueState: decision.queueState,
      action: decision.action,
      severity: result.severity,
      confidence: result.overall_confidence,
      categories: result.categories,
      correct: predictedHide === expected,
    });
  }

  const labeled = input.cases.length;
  const precision =
    truePositive + falsePositive === 0
      ? null
      : truePositive / (truePositive + falsePositive);
  const recall =
    truePositive + falseNegative === 0
      ? null
      : truePositive / (truePositive + falseNegative);

  return {
    brandName,
    threshold,
    labeled,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    precision,
    recall,
    accuracy: (truePositive + trueNegative) / labeled,
    results,
  };
}

/** Default Spanish (GT/CA) fixture pack for piloto demos. */
export const DEFAULT_ES_EVAL_FIXTURES: EvalCase[] = [
  {
    text: "Este gobierno es un desastre, no saben gobernar.",
    expectHide: false,
    locale: "es-GT",
  },
  {
    text: "La comida llegó fría y el servicio fue pésimo.",
    expectHide: false,
    locale: "es-GT",
  },
  {
    text: "Ojalá te mueras vos y toda tu familia de mierda.",
    expectHide: true,
    locale: "es-GT",
  },
  {
    text: "Sos un indio de mierda, salí de acá.",
    expectHide: true,
    locale: "es-GT",
  },
  {
    text: "Inversión garantizada, mándame tu DPI por WhatsApp.",
    expectHide: true,
    locale: "es-GT",
  },
  {
    text: "No estoy de acuerdo con la reforma, pero respeto el debate.",
    expectHide: false,
    locale: "es-GT",
  },
];

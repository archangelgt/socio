import { TAXONOMY_VERSION } from "@social-ai/domain";
import type { ModerationResult } from "@social-ai/domain";
import { describe, expect, it } from "vitest";
import { defaultModerationRules, evaluateModerationPolicy } from "./policy";

const hideCapable = {
  hideComments: true,
  unhideComments: true,
  deleteComments: false,
};

function result(
  overrides: Partial<ModerationResult> &
    Pick<
      ModerationResult,
      "categories" | "severity" | "overall_confidence" | "recommended_action"
    >,
): ModerationResult {
  return {
    taxonomy_version: TAXONOMY_VERSION,
    needs_human_review: false,
    ...overrides,
  };
}

describe("evaluateModerationPolicy", () => {
  const rules = defaultModerationRules();

  it("auto-hides high-confidence hate speech", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "hate_speech", confidence: 0.97 }],
        severity: "HIGH",
        overall_confidence: 0.97,
        recommended_action: "HIDE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision).toMatchObject({
      queueState: "AUTO_HIDDEN",
      action: "HIDE",
    });
  });

  it("sends medium-confidence hate speech to review", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "hate_speech", confidence: 0.74 }],
        severity: "HIGH",
        overall_confidence: 0.74,
        recommended_action: "HIDE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("REVIEW_REQUIRED");
    expect(decision.reason).toBe("medium_confidence");
  });

  it("auto-hides high-confidence spam", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "spam", confidence: 0.98 }],
        severity: "HIGH",
        overall_confidence: 0.98,
        recommended_action: "HIDE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("AUTO_HIDDEN");
  });

  it("allows safe comments", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "safe", confidence: 0.98 }],
        severity: "NONE",
        overall_confidence: 0.98,
        recommended_action: "ALLOW",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision).toMatchObject({
      queueState: "AUTO_ALLOWED",
      action: "ALLOW",
    });
  });

  it("allows negative criticism that is not a violation", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "complaint", confidence: 0.96 }],
        severity: "NONE",
        overall_confidence: 0.96,
        recommended_action: "ALLOW",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("AUTO_ALLOWED");
  });

  it("reviews low-confidence unknown output", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "other", confidence: 0.52 }],
        severity: "LOW",
        overall_confidence: 0.52,
        recommended_action: "ALLOW",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("REVIEW_REQUIRED");
    expect(decision.reason).toBe("low_confidence");
  });

  it("reviews threats even at high confidence", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "threat", confidence: 0.99 }],
        severity: "CRITICAL",
        overall_confidence: 0.99,
        recommended_action: "HIDE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("REVIEW_REQUIRED");
    expect(decision.reason).toBe("rule_requires_human");
  });

  it("reviews self-harm instead of auto-hiding", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "self_harm_related", confidence: 0.95 }],
        severity: "HIGH",
        overall_confidence: 0.95,
        recommended_action: "ESCALATE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: hideCapable,
    });

    expect(decision.queueState).toBe("REVIEW_REQUIRED");
  });

  it("does not pretend to hide when the channel cannot", () => {
    const decision = evaluateModerationPolicy({
      result: result({
        categories: [{ name: "hate_speech", confidence: 0.97 }],
        severity: "HIGH",
        overall_confidence: 0.97,
        recommended_action: "HIDE",
      }),
      rules,
      policyConfidenceThreshold: 0.9,
      capabilities: {
        hideComments: false,
        unhideComments: false,
        deleteComments: false,
      },
    });

    expect(decision.queueState).toBe("REVIEW_REQUIRED");
    expect(decision.reason).toBe("hide_not_supported");
  });
});

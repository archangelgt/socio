import type {
  ModerationAction,
  ModerationCategory,
  ModerationResult,
  ModerationRule,
  QueueState,
  Severity,
} from "@social-ai/domain";
import { NORMAL_CATEGORIES } from "@social-ai/domain";

const SEVERITY_RANK: Record<Severity, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const ACTION_RANK: Record<ModerationAction, number> = {
  ALLOW: 0,
  TAG: 1,
  NOTIFY: 2,
  FLAG: 3,
  ESCALATE: 4,
  HIDE: 5,
  DELETE: 6,
};

export type ChannelModerationCapabilities = {
  hideComments: boolean;
  unhideComments: boolean;
  deleteComments: boolean;
};

export type PolicyEvaluationInput = {
  result: ModerationResult;
  rules: ModerationRule[];
  policyConfidenceThreshold: number;
  capabilities: ChannelModerationCapabilities;
};

export type PolicyEvaluation = {
  queueState: QueueState;
  action: ModerationAction | null;
  reason: string;
};

export function defaultModerationRules(): ModerationRule[] {
  const hideHigh = (
    category: ModerationCategory,
    minimum_severity: Severity = "HIGH",
  ): ModerationRule => ({
    category,
    minimum_severity,
    minimum_confidence: 0.9,
    action: "HIDE",
    require_human: false,
    enabled: true,
  });

  return [
    hideHigh("hate_speech"),
    hideHigh("harassment"),
    {
      category: "threat",
      minimum_severity: "HIGH",
      minimum_confidence: 0,
      action: "HIDE",
      require_human: true,
      enabled: true,
    },
    hideHigh("discrimination"),
    hideHigh("severe_profanity"),
    hideHigh("spam"),
    hideHigh("scam"),
    hideHigh("phishing"),
    hideHigh("sexual_content"),
    hideHigh("violent_content"),
    hideHigh("graphic_content"),
    {
      category: "self_harm_related",
      minimum_severity: "NONE",
      minimum_confidence: 0,
      action: "ESCALATE",
      require_human: true,
      enabled: true,
    },
  ];
}

function isNormalCategory(name: ModerationCategory): boolean {
  return (NORMAL_CATEGORIES as readonly string[]).includes(name);
}

function strongestAction(actions: ModerationAction[]): ModerationAction {
  return actions.reduce((best, current) =>
    ACTION_RANK[current] > ACTION_RANK[best] ? current : best,
  );
}

export function evaluateModerationPolicy(
  input: PolicyEvaluationInput,
): PolicyEvaluation {
  const { result, capabilities, policyConfidenceThreshold } = input;
  const rules = input.rules.filter((rule) => rule.enabled);

  if (result.needs_human_review) {
    return {
      queueState: "REVIEW_REQUIRED",
      action: null,
      reason: "model_requested_review",
    };
  }

  if (result.overall_confidence < 0.7) {
    return {
      queueState: "REVIEW_REQUIRED",
      action: null,
      reason: "low_confidence",
    };
  }

  const applicable: ModerationRule[] = [];

  for (const score of result.categories) {
    if (isNormalCategory(score.name)) {
      continue;
    }

    for (const rule of rules) {
      if (rule.category !== score.name) {
        continue;
      }
      if (
        SEVERITY_RANK[result.severity] < SEVERITY_RANK[rule.minimum_severity]
      ) {
        continue;
      }
      applicable.push(rule);
    }
  }

  if (applicable.length === 0) {
    const onlyNormal =
      result.categories.length > 0 &&
      result.categories.every((item) => isNormalCategory(item.name));

    if (onlyNormal || result.recommended_action === "ALLOW") {
      return {
        queueState: "AUTO_ALLOWED",
        action: "ALLOW",
        reason: "no_violating_rule",
      };
    }

    return {
      queueState: "REVIEW_REQUIRED",
      action: null,
      reason: "no_matching_rule",
    };
  }

  const action = strongestAction(applicable.map((rule) => rule.action));
  const requiredConfidence = Math.max(
    policyConfidenceThreshold,
    ...applicable.map((rule) => rule.minimum_confidence),
  );

  if (applicable.some((rule) => rule.require_human)) {
    return {
      queueState: "REVIEW_REQUIRED",
      action,
      reason: "rule_requires_human",
    };
  }

  if (
    result.overall_confidence < 0.9 ||
    result.overall_confidence < requiredConfidence
  ) {
    return {
      queueState: "REVIEW_REQUIRED",
      action,
      reason: "medium_confidence",
    };
  }

  if (action === "HIDE" && !capabilities.hideComments) {
    return {
      queueState: "REVIEW_REQUIRED",
      action: "HIDE",
      reason: "hide_not_supported",
    };
  }

  if (action === "DELETE" && !capabilities.deleteComments) {
    return {
      queueState: "REVIEW_REQUIRED",
      action: "DELETE",
      reason: "delete_not_supported",
    };
  }

  if (action === "HIDE") {
    return {
      queueState: "AUTO_HIDDEN",
      action: "HIDE",
      reason: "policy_auto_hide",
    };
  }

  if (action === "ALLOW") {
    return {
      queueState: "AUTO_ALLOWED",
      action: "ALLOW",
      reason: "policy_auto_allow",
    };
  }

  return {
    queueState: "REVIEW_REQUIRED",
    action,
    reason: "action_not_auto_executable",
  };
}

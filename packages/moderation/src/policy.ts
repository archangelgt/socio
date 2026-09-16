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

/** Hide-first floor: uncertain abuse stays off the public feed. */
export const HIDE_FIRST_CONFIDENCE_FLOOR = 0.5;
export const DEFAULT_POLICY_CONFIDENCE_THRESHOLD = 0.65;
export const DEFAULT_RULE_MINIMUM_CONFIDENCE = 0.65;

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
  const hideAbuse = (
    category: ModerationCategory,
    minimum_severity: Severity = "LOW",
  ): ModerationRule => ({
    category,
    minimum_severity,
    minimum_confidence: DEFAULT_RULE_MINIMUM_CONFIDENCE,
    action: "HIDE",
    require_human: false,
    enabled: true,
  });

  return [
    hideAbuse("hate_speech"),
    hideAbuse("harassment"),
    hideAbuse("bullying"),
    {
      category: "threat",
      minimum_severity: "HIGH",
      minimum_confidence: 0,
      action: "HIDE",
      require_human: true,
      enabled: true,
    },
    hideAbuse("discrimination"),
    hideAbuse("severe_profanity"),
    hideAbuse("spam", "MEDIUM"),
    hideAbuse("scam", "MEDIUM"),
    hideAbuse("phishing", "MEDIUM"),
    hideAbuse("sexual_content", "MEDIUM"),
    hideAbuse("violent_content", "MEDIUM"),
    hideAbuse("graphic_content", "MEDIUM"),
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

function hasAbuseSignal(result: ModerationResult): boolean {
  if (
    result.recommended_action === "HIDE" ||
    result.recommended_action === "FLAG" ||
    result.recommended_action === "DELETE"
  ) {
    return true;
  }
  return result.categories.some((item) => !isNormalCategory(item.name));
}

function autoHide(reason: string): PolicyEvaluation {
  return {
    queueState: "AUTO_HIDDEN",
    action: "HIDE",
    reason,
  };
}

export function evaluateModerationPolicy(
  input: PolicyEvaluationInput,
): PolicyEvaluation {
  const { result, capabilities, policyConfidenceThreshold } = input;
  const rules = input.rules.filter((rule) => rule.enabled);

  if (result.needs_human_review) {
    // Threats / self-harm stay in review; still hide-first when the model
    // recommends hiding and the channel can, so the public feed stays clean.
    if (
      result.recommended_action === "HIDE" &&
      capabilities.hideComments &&
      result.overall_confidence >= HIDE_FIRST_CONFIDENCE_FLOOR
    ) {
      return autoHide("model_review_hide_first");
    }
    return {
      queueState: "REVIEW_REQUIRED",
      action: null,
      reason: "model_requested_review",
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

    if (
      hasAbuseSignal(result) &&
      capabilities.hideComments &&
      result.overall_confidence >= HIDE_FIRST_CONFIDENCE_FLOOR
    ) {
      return autoHide("abuse_signal_hide_first");
    }

    if (onlyNormal || result.recommended_action === "ALLOW") {
      if (result.overall_confidence < HIDE_FIRST_CONFIDENCE_FLOOR) {
        return {
          queueState: "REVIEW_REQUIRED",
          action: null,
          reason: "low_confidence",
        };
      }
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
    if (
      action === "HIDE" &&
      capabilities.hideComments &&
      result.overall_confidence >= HIDE_FIRST_CONFIDENCE_FLOOR
    ) {
      return autoHide("rule_requires_human_hide_first");
    }
    return {
      queueState: "REVIEW_REQUIRED",
      action,
      reason: "rule_requires_human",
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
    if (result.overall_confidence >= requiredConfidence) {
      return autoHide("policy_auto_hide");
    }
    if (result.overall_confidence >= HIDE_FIRST_CONFIDENCE_FLOOR) {
      return autoHide("uncertain_hide_first");
    }
    return {
      queueState: "REVIEW_REQUIRED",
      action: "HIDE",
      reason: "very_low_confidence",
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

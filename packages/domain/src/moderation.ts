export const TAXONOMY_VERSION = "2026-08-22";

export const MODERATION_CATEGORIES = [
  "hate_speech",
  "harassment",
  "bullying",
  "threat",
  "discrimination",
  "severe_profanity",
  "sexual_content",
  "violent_content",
  "graphic_content",
  "self_harm_related",
  "spam",
  "scam",
  "phishing",
  "impersonation",
  "bot_like",
  "repetitive_comment",
  "irrelevant_promotion",
  "safe",
  "question",
  "product_question",
  "feedback",
  "complaint",
  "other",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export const SEVERITIES = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type Severity = (typeof SEVERITIES)[number];

export const MODERATION_ACTIONS = [
  "ALLOW",
  "FLAG",
  "HIDE",
  "DELETE",
  "ESCALATE",
  "TAG",
  "NOTIFY",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const QUEUE_STATES = [
  "PENDING",
  "AUTO_ALLOWED",
  "AUTO_HIDDEN",
  "REVIEW_REQUIRED",
  "APPROVED",
  "OVERRIDDEN",
  "ACTION_FAILED",
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

export const NORMAL_CATEGORIES = [
  "safe",
  "question",
  "product_question",
  "feedback",
  "complaint",
  "other",
] as const satisfies readonly ModerationCategory[];

export type CategoryScore = {
  name: ModerationCategory;
  confidence: number;
};

export type ModerationResult = {
  taxonomy_version: string;
  categories: CategoryScore[];
  severity: Severity;
  overall_confidence: number;
  recommended_action: ModerationAction;
  needs_human_review: boolean;
};

export type ModerationRule = {
  category: ModerationCategory;
  minimum_severity: Severity;
  minimum_confidence: number;
  action: ModerationAction;
  require_human: boolean;
  enabled: boolean;
};

export type TenantScoped<T extends { organizationId: string }> = T;

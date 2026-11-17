import type { ModerationCategory, Severity } from "./moderation";

export const URGENCIES = ["GREEN", "YELLOW", "RED"] as const;
export type Urgency = (typeof URGENCIES)[number];

const URGENCY_RANK: Record<Urgency, number> = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
};

/** Immediate-attention categories from AndyMorales RF-34 / RF-17. */
const RED_CATEGORIES = new Set<ModerationCategory>([
  "threat",
  "self_harm_related",
  "hate_speech",
  "violent_content",
  "graphic_content",
]);

const ATTENTION_CATEGORIES = new Set<ModerationCategory>([
  "complaint",
  "scam",
  "phishing",
]);

export function urgencyRank(urgency: Urgency): number {
  return URGENCY_RANK[urgency];
}

export function effectiveUrgency(
  computed: Urgency,
  override: Urgency | null | undefined,
): Urgency {
  return override ?? computed;
}

/**
 * Derive traffic-light urgency from severity + categories.
 * Threats / self-harm / hate → RED. Complaints/scams → at least YELLOW.
 */
export function computeUrgency(input: {
  severity: Severity | null | undefined;
  categories?: readonly { name: string }[];
}): Urgency {
  const names = (input.categories ?? []).map((item) => item.name);
  if (names.some((name) => RED_CATEGORIES.has(name as ModerationCategory))) {
    return "RED";
  }
  if (input.severity === "CRITICAL" || input.severity === "HIGH") {
    return "RED";
  }
  if (
    input.severity === "MEDIUM" ||
    names.some((name) => ATTENTION_CATEGORIES.has(name as ModerationCategory))
  ) {
    return "YELLOW";
  }
  return "GREEN";
}

export function caseKindFromCategories(
  categories: readonly { name: string }[] | undefined,
): "none" | "attention" | "complaint" | "scam" {
  const names = new Set((categories ?? []).map((item) => item.name));
  if (names.has("scam") || names.has("phishing")) {
    return "scam";
  }
  if (names.has("complaint")) {
    return "complaint";
  }
  if (
    [...RED_CATEGORIES].some((name) => names.has(name)) ||
    names.has("harassment")
  ) {
    return "attention";
  }
  return "none";
}

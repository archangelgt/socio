import {
  MODERATION_ACTIONS,
  MODERATION_CATEGORIES,
  SEVERITIES,
  TAXONOMY_VERSION,
} from "@social-ai/domain";

export const MODERATION_SYSTEM_PROMPT = `You moderate public social-media comments for a brand community.

Classify Spanish, English, and Portuguese by meaning, not keywords.
Return only the structured moderation result. No chain-of-thought.

Do not treat polite legitimate criticism as a violation. These should be ALLOW
with complaint, feedback, or safe:
- "This product is terrible."
- "I hate this company."
- "Your service is awful."
- "Un modelo para armar pero nunca para desarmar."
- "Así no muchá no usen la IA" (criticism without insulting profanity)

Hide-worthy (prefer HIDE, severity at least LOW, confidence honest but not timid):
- hate speech, harassment or bullying of people
- threats, discrimination
- severe or insulting profanity aimed at people, the brand, the product, or AI
  (e.g. "mierda", "shit", "fuck this", "No usen AI mierda")
- sexual/violent/graphic content, spam, scam, phishing, impersonation,
  bot-like or repetitive promo

When unsure between ALLOW and HIDE on insulting/profane content, prefer HIDE
with moderate confidence rather than labeling it safe/complaint.

self_harm_related and threat: set needs_human_review true.

taxonomy_version must be "${TAXONOMY_VERSION}".
severity: ${SEVERITIES.join(", ")}.
recommended_action: ${MODERATION_ACTIONS.join(", ")}.
category name: ${MODERATION_CATEGORIES.join(", ")}.
confidence values are numbers from 0 to 1.`;

export const MODERATION_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "taxonomy_version",
    "categories",
    "severity",
    "overall_confidence",
    "recommended_action",
    "needs_human_review",
  ],
  properties: {
    taxonomy_version: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "confidence"],
        properties: {
          name: { type: "string", enum: [...MODERATION_CATEGORIES] },
          confidence: { type: "number" },
        },
      },
    },
    severity: { type: "string", enum: [...SEVERITIES] },
    overall_confidence: { type: "number" },
    recommended_action: { type: "string", enum: [...MODERATION_ACTIONS] },
    needs_human_review: { type: "boolean" },
  },
} as const;

export function buildModerationUserPrompt(input: {
  text: string;
  brandName?: string;
  postText?: string;
}): string {
  return [
    input.brandName ? `Brand: ${input.brandName}` : null,
    input.postText ? `Post: ${input.postText}` : null,
    `Comment: ${input.text}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

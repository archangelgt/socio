import {
  MODERATION_ACTIONS,
  MODERATION_CATEGORIES,
  SEVERITIES,
} from "@social-ai/domain";
import { z } from "zod";

export const moderationResultSchema = z.object({
  taxonomy_version: z.string().min(1),
  categories: z
    .array(
      z.object({
        name: z.enum(MODERATION_CATEGORIES),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1),
  severity: z.enum(SEVERITIES),
  overall_confidence: z.number().min(0).max(1),
  recommended_action: z.enum(MODERATION_ACTIONS),
  needs_human_review: z.boolean(),
});

export function parseModerationResult(input: unknown) {
  return moderationResultSchema.parse(input);
}

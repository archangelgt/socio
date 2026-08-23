import type { ModerationResult } from "@social-ai/domain";
import { TAXONOMY_VERSION } from "@social-ai/domain";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ClassificationRequest,
  ClassificationResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModerationRequest,
} from "./types";

const ABUSE_WORDS = ["hate", "kill", "scam", "phishing", "spam"];

export class MockAIProvider implements AIProvider {
  readonly provider = "mock";
  readonly model = "mock-moderation";

  async generate(input: AIRequest): Promise<AIResponse> {
    return { text: `mock-reply:${input.prompt.slice(0, 80)}` };
  }

  async classify(
    _input: ClassificationRequest,
  ): Promise<ClassificationResponse> {
    return { intent: "other", sentiment: "neutral", confidence: 0.5 };
  }

  async moderate(input: ModerationRequest): Promise<ModerationResult> {
    const lower = input.text.toLowerCase();
    const abusive = ABUSE_WORDS.some((word) => lower.includes(word));

    if (abusive) {
      return {
        taxonomy_version: TAXONOMY_VERSION,
        categories: [{ name: "harassment", confidence: 0.96 }],
        severity: "HIGH",
        overall_confidence: 0.96,
        recommended_action: "HIDE",
        needs_human_review: false,
      };
    }

    return {
      taxonomy_version: TAXONOMY_VERSION,
      categories: [{ name: "safe", confidence: 0.95 }],
      severity: "NONE",
      overall_confidence: 0.95,
      recommended_action: "ALLOW",
      needs_human_review: false,
    };
  }

  async embed(_input: EmbeddingRequest): Promise<EmbeddingResponse> {
    return { embedding: [0, 0, 0] };
  }
}

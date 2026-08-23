import {
  MODERATION_ACTIONS,
  MODERATION_CATEGORIES,
  type ModerationResult,
  SEVERITIES,
  TAXONOMY_VERSION,
} from "@social-ai/domain";
import { AIProviderError } from "./errors";
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

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You moderate public social-media comments for a brand community.

Classify Spanish, English, and Portuguese by meaning, not keywords.
Return only the structured moderation result. No chain-of-thought.

Do not treat legitimate criticism as a violation. These should be ALLOW
with complaint, feedback, or safe:
- "This product is terrible."
- "I hate this company."
- "Your service is awful."
- "Un modelo para armar pero nunca para desarmar."

Hide-worthy: hate speech, harassment or bullying of people, threats,
discrimination, severe profanity aimed at people, sexual/violent/graphic
content, spam, scam, phishing, impersonation, bot-like or repetitive promo.

self_harm_related and threat: set needs_human_review true.

taxonomy_version must be "${TAXONOMY_VERSION}".
severity: ${SEVERITIES.join(", ")}.
recommended_action: ${MODERATION_ACTIONS.join(", ")}.
category name: ${MODERATION_CATEGORIES.join(", ")}.
confidence values are numbers from 0 to 1.`;

const RESULT_SCHEMA = {
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

export type OpenAICompatibleConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

export class OpenAICompatibleProvider implements AIProvider {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model?.trim() || DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generate(_input: AIRequest): Promise<AIResponse> {
    throw new AIProviderError("generate is not enabled in V1.");
  }

  async classify(
    _input: ClassificationRequest,
  ): Promise<ClassificationResponse> {
    throw new AIProviderError("classify is not enabled in V1.");
  }

  async embed(_input: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new AIProviderError("embed is not enabled in V1.");
  }

  async moderate(input: ModerationRequest): Promise<ModerationResult> {
    const userParts = [
      input.brandName ? `Brand: ${input.brandName}` : null,
      input.postText ? `Post: ${input.postText}` : null,
      `Comment: ${input.text}`,
    ].filter((part): part is string => Boolean(part));

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "moderation_result",
            strict: true,
            schema: RESULT_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userParts.join("\n") },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new AIProviderError(
        body.error?.message ?? `OpenAI HTTP ${response.status}`,
        response.status,
      );
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIProviderError("OpenAI returned an empty moderation result.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new AIProviderError("OpenAI returned invalid JSON.");
    }

    if (!parsed || typeof parsed !== "object") {
      throw new AIProviderError("OpenAI returned a non-object result.");
    }

    return {
      ...(parsed as ModerationResult),
      taxonomy_version: TAXONOMY_VERSION,
    };
  }
}

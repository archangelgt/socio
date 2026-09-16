import { type ModerationResult, TAXONOMY_VERSION } from "@social-ai/domain";
import { AIProviderError } from "./errors";
import {
  MODERATION_RESULT_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  buildModerationUserPrompt,
} from "./moderation-contract";
import {
  SUGGEST_REPLY_SYSTEM_PROMPT,
  buildSuggestReplyUserPrompt,
} from "./suggest-reply";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ClassificationRequest,
  ClassificationResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModerationRequest,
  SuggestReplyRequest,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export type OpenAICompatibleConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
  }>;
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
            schema: MODERATION_RESULT_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: MODERATION_SYSTEM_PROMPT },
          { role: "user", content: buildModerationUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new AIProviderError(
        body.error?.message
          ? `OpenAI HTTP ${response.status}: ${body.error.message}`
          : `OpenAI HTTP ${response.status}`,
        response.status,
      );
    }

    const message = body.choices?.[0]?.message;
    const content = message?.content;
    if (!content) {
      throw new AIProviderError(
        message?.refusal || "OpenAI returned an empty moderation result.",
      );
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

  async suggestReply(input: SuggestReplyRequest): Promise<AIResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        messages: [
          { role: "system", content: SUGGEST_REPLY_SYSTEM_PROMPT },
          { role: "user", content: buildSuggestReplyUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new AIProviderError(
        body.error?.message
          ? `OpenAI HTTP ${response.status}: ${body.error.message}`
          : `OpenAI HTTP ${response.status}`,
        response.status,
      );
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AIProviderError(
        body.choices?.[0]?.message?.refusal ||
          "OpenAI returned an empty reply suggestion.",
      );
    }

    return { text: content.replace(/^["']|["']$/g, "").trim() };
  }
}

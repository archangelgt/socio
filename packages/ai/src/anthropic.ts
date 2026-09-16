import {
  type ModerationResult,
  TAXONOMY_VERSION,
} from "@social-ai/domain";
import { AIProviderError } from "./errors";
import {
  buildModerationUserPrompt,
  MODERATION_RESULT_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
} from "./moderation-contract";
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

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
  error?: { message?: string; type?: string };
};

export class AnthropicProvider implements AIProvider {
  readonly provider = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AnthropicConfig) {
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
    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        temperature: 0,
        system: MODERATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildModerationUserPrompt(input),
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: MODERATION_RESULT_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as AnthropicMessagesResponse;
    if (!response.ok) {
      throw new AIProviderError(
        body.error?.message
          ? `Anthropic HTTP ${response.status}: ${body.error.message}`
          : `Anthropic HTTP ${response.status}`,
        response.status,
      );
    }

    const text = body.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      throw new AIProviderError("Anthropic returned an empty moderation result.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new AIProviderError("Anthropic returned invalid JSON.");
    }

    if (!parsed || typeof parsed !== "object") {
      throw new AIProviderError("Anthropic returned a non-object result.");
    }

    return {
      ...(parsed as ModerationResult),
      taxonomy_version: TAXONOMY_VERSION,
    };
  }
}

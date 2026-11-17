import { type ModerationResult, TAXONOMY_VERSION } from "@social-ai/domain";
import { AIProviderError } from "./errors";
import {
  MODERATION_RESULT_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  moderationUserContent,
} from "./moderation-prompt";
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
const TOOL_NAME = "moderation_result";

export type AnthropicConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type AnthropicContentBlock =
  | { type: "tool_use"; name: string; input: unknown }
  | { type: string; [key: string]: unknown };

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
        tools: [
          {
            name: TOOL_NAME,
            description:
              "Return the structured social-comment moderation result.",
            input_schema: MODERATION_RESULT_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: moderationUserContent(input),
          },
        ],
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

    const toolUse = body.content?.find(
      (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse || !toolUse.input || typeof toolUse.input !== "object") {
      throw new AIProviderError(
        "Anthropic returned no moderation_result tool output.",
      );
    }

    return {
      ...(toolUse.input as ModerationResult),
      taxonomy_version: TAXONOMY_VERSION,
    };
  }
}

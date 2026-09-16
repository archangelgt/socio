import type { ModerationResult } from "@social-ai/domain";

export type AIRequest = {
  organizationId: string;
  prompt: string;
};

export type AIResponse = {
  text: string;
};

export type ClassificationRequest = {
  organizationId: string;
  text: string;
};

export type ClassificationResponse = {
  intent: string;
  sentiment: string;
  confidence: number;
};

export type ModerationRequest = {
  organizationId: string;
  text: string;
  brandName?: string;
  postText?: string;
};

export type SuggestReplyRequest = {
  organizationId: string;
  commentText: string;
  brandName?: string;
  postText?: string;
  authorDisplayName?: string;
};

export type EmbeddingRequest = {
  organizationId: string;
  text: string;
};

export type EmbeddingResponse = {
  embedding: number[];
};

export type AIEnv = Record<string, string | undefined>;

export interface AIProvider {
  readonly provider: string;
  readonly model: string;
  generate(input: AIRequest): Promise<AIResponse>;
  classify(input: ClassificationRequest): Promise<ClassificationResponse>;
  moderate(input: ModerationRequest): Promise<ModerationResult>;
  suggestReply(input: SuggestReplyRequest): Promise<AIResponse>;
  embed(input: EmbeddingRequest): Promise<EmbeddingResponse>;
}

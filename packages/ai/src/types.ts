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
  embed(input: EmbeddingRequest): Promise<EmbeddingResponse>;
}

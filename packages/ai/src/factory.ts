import { AIProviderError } from "./errors";
import { MockAIProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai";
import type { AIEnv, AIProvider } from "./types";

export function createAIProvider(
  env: AIEnv = process.env,
  fetchImpl?: typeof fetch,
): AIProvider {
  const name = (env.AI_PROVIDER ?? "mock").trim().toLowerCase();
  if (name === "mock" || name === "") {
    return new MockAIProvider();
  }
  if (name === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new AIProviderError("Set OPENAI_API_KEY when AI_PROVIDER=openai.");
    }
    return new OpenAICompatibleProvider({
      apiKey,
      model: env.OPENAI_MODEL,
      baseUrl: env.OPENAI_BASE_URL,
      fetchImpl,
    });
  }
  throw new AIProviderError(`Unsupported AI_PROVIDER "${name}".`);
}

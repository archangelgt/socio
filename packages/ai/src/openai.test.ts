import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic";
import { createAIProvider } from "./factory";
import { MockAIProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai";

describe("createAIProvider", () => {
  it("defaults to the mock provider", () => {
    expect(createAIProvider({})).toBeInstanceOf(MockAIProvider);
  });

  it("requires OPENAI_API_KEY for openai", () => {
    expect(() => createAIProvider({ AI_PROVIDER: "openai" })).toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it("builds an OpenAI-compatible provider", () => {
    const ai = createAIProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    expect(ai).toBeInstanceOf(OpenAICompatibleProvider);
    expect(ai.provider).toBe("openai");
  });

  it("requires ANTHROPIC_API_KEY for anthropic", () => {
    expect(() => createAIProvider({ AI_PROVIDER: "anthropic" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("builds an Anthropic provider", () => {
    const ai = createAIProvider({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(ai).toBeInstanceOf(AnthropicProvider);
    expect(ai.provider).toBe("anthropic");
    expect(ai.model).toBe("claude-haiku-4-5");
  });
});

describe("OpenAICompatibleProvider", () => {
  it("sends the comment and returns structured JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                taxonomy_version: "ignored",
                categories: [{ name: "complaint", confidence: 0.91 }],
                severity: "NONE",
                overall_confidence: 0.91,
                recommended_action: "ALLOW",
                needs_human_review: false,
              }),
            },
          },
        ],
      }),
    );

    const ai = new OpenAICompatibleProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await ai.moderate({
      organizationId: "org-1",
      text: "This product is terrible.",
      brandName: "Acme",
      postText: "New drop",
    });

    expect(result.taxonomy_version).toBe("2026-08-22");
    expect(result.recommended_action).toBe("ALLOW");
    const call = fetchImpl.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(call[1].body) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1]?.content).toContain("This product is terrible.");
    expect(body.messages[1]?.content).toContain("Acme");
  });

  it("throws when the API returns an error", async () => {
    const ai = new OpenAICompatibleProvider({
      apiKey: "sk-test",
      fetchImpl: (async () =>
        Response.json(
          { error: { message: "quota" } },
          { status: 429 },
        )) as unknown as typeof fetch,
    });
    await expect(
      ai.moderate({ organizationId: "org-1", text: "hola" }),
    ).rejects.toThrow(/OpenAI HTTP 429: quota/);
  });

  it("throws a refusal instead of an empty result", async () => {
    const ai = new OpenAICompatibleProvider({
      apiKey: "sk-test",
      fetchImpl: (async () =>
        Response.json({
          choices: [{ message: { content: null, refusal: "refused" } }],
        })) as unknown as typeof fetch,
    });
    await expect(
      ai.moderate({ organizationId: "org-1", text: "hola" }),
    ).rejects.toThrow(/refused/);
  });
});

describe("AnthropicProvider", () => {
  it("sends the comment and returns structured JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              taxonomy_version: "ignored",
              categories: [{ name: "complaint", confidence: 0.91 }],
              severity: "NONE",
              overall_confidence: 0.91,
              recommended_action: "ALLOW",
              needs_human_review: false,
            }),
          },
        ],
      }),
    );

    const ai = new AnthropicProvider({
      apiKey: "sk-ant-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await ai.moderate({
      organizationId: "org-1",
      text: "This product is terrible.",
      brandName: "Acme",
      postText: "New drop",
    });

    expect(result.taxonomy_version).toBe("2026-08-22");
    expect(result.recommended_action).toBe("ALLOW");

    const call = fetchImpl.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(call[1].headers["x-api-key"]).toBe("sk-ant-test");
    const body = JSON.parse(call[1].body) as {
      messages: Array<{ content: string }>;
      output_config: { format: { type: string } };
    };
    expect(body.messages[0]?.content).toContain("This product is terrible.");
    expect(body.messages[0]?.content).toContain("Acme");
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("throws when the API returns an error", async () => {
    const ai = new AnthropicProvider({
      apiKey: "sk-ant-test",
      fetchImpl: (async () =>
        Response.json(
          { error: { message: "rate_limit" } },
          { status: 429 },
        )) as unknown as typeof fetch,
    });
    await expect(
      ai.moderate({ organizationId: "org-1", text: "hola" }),
    ).rejects.toThrow(/Anthropic HTTP 429: rate_limit/);
  });

  it("throws when content is empty", async () => {
    const ai = new AnthropicProvider({
      apiKey: "sk-ant-test",
      fetchImpl: (async () =>
        Response.json({ content: [] })) as unknown as typeof fetch,
    });
    await expect(
      ai.moderate({ organizationId: "org-1", text: "hola" }),
    ).rejects.toThrow(/empty moderation result/);
  });
});

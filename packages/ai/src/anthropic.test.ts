import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic";
import { createAIProvider } from "./factory";

describe("createAIProvider anthropic", () => {
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
  });
});

describe("AnthropicProvider", () => {
  it("sends the comment via tool_use and returns structured JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        content: [
          {
            type: "tool_use",
            name: "moderation_result",
            input: {
              taxonomy_version: "ignored",
              categories: [{ name: "complaint", confidence: 0.91 }],
              severity: "NONE",
              overall_confidence: 0.91,
              recommended_action: "ALLOW",
              needs_human_review: false,
            },
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
    expect(call[0]).toContain("/v1/messages");
    expect(call[1].headers["x-api-key"]).toBe("sk-ant-test");
    const body = JSON.parse(call[1].body) as {
      tool_choice: { name: string };
      messages: Array<{ content: string }>;
    };
    expect(body.tool_choice.name).toBe("moderation_result");
    expect(body.messages[0]?.content).toContain("This product is terrible.");
    expect(body.messages[0]?.content).toContain("Acme");
  });

  it("throws when the API returns an error", async () => {
    const ai = new AnthropicProvider({
      apiKey: "sk-ant-test",
      fetchImpl: (async () =>
        Response.json(
          { error: { message: "overloaded" } },
          { status: 529 },
        )) as unknown as typeof fetch,
    });
    await expect(
      ai.moderate({ organizationId: "org-1", text: "hola" }),
    ).rejects.toThrow(/Anthropic HTTP 529: overloaded/);
  });
});

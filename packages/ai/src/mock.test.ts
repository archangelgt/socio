import { describe, expect, it } from "vitest";
import { MockAIProvider } from "./mock";

describe("MockAIProvider", () => {
  it("flags abusive text and allows criticism", async () => {
    const ai = new MockAIProvider();
    const abuse = await ai.moderate({
      organizationId: "org-1",
      text: "This is a scam",
    });
    const criticism = await ai.moderate({
      organizationId: "org-1",
      text: "This product is terrible.",
    });

    expect(abuse.recommended_action).toBe("HIDE");
    expect(criticism.recommended_action).toBe("ALLOW");
  });
});

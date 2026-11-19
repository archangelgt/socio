import { describe, expect, it, vi } from "vitest";
import { MetaChannelAdapter } from "./meta";
import { MockChannelAdapter } from "./mock";

describe("publish adapters", () => {
  it("mock publish returns a permalink", async () => {
    const adapter = new MockChannelAdapter();
    expect(adapter.capabilities().publishPosts).toBe(true);
    const result = await adapter.publish({
      organizationId: "org-1",
      accountId: "acc-1",
      body: "hola",
    });
    expect(result.ok).toBe(true);
    expect(result.externalPostId).toMatch(/^mock-post-/);
    expect(result.permalink).toContain("https://example.com/mock/");
  });

  it("meta facebook feed posts via Graph", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: "page_123_post_9" }),
    );
    const adapter = new MetaChannelAdapter({
      appSecret: "secret",
      verifyToken: "verify",
      graphVersion: "v21.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await adapter.publish({
      organizationId: "org-1",
      accountId: "page_123",
      body: "Lanzamiento",
      accessToken: "token",
      network: "facebook",
    });
    expect(result.ok).toBe(true);
    expect(result.externalPostId).toBe("page_123_post_9");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("meta instagram without image asks for mobile", async () => {
    const adapter = new MetaChannelAdapter({
      appSecret: "secret",
      verifyToken: "verify",
      graphVersion: "v21.0",
    });
    const result = await adapter.publish({
      organizationId: "org-1",
      accountId: "ig_1",
      body: "caption",
      accessToken: "token",
      network: "instagram",
    });
    expect(result.needsMobile).toBe(true);
  });
});

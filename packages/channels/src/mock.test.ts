import { describe, expect, it } from "vitest";
import { MockChannelAdapter } from "./mock";
import { UnsupportedChannelActionError } from "./types";

describe("MockChannelAdapter", () => {
  it("normalizes a comment event and can hide it", async () => {
    const adapter = new MockChannelAdapter();
    const events = await adapter.normalizeEvent({
      externalEventId: "evt-1",
      accountId: "acc-1",
      comment: {
        externalCommentId: "c-1",
        externalPostId: "p-1",
        authorExternalId: "u-1",
        body: "spam",
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("comment.received");

    await adapter.hideComment({
      organizationId: "org-1",
      accountId: "acc-1",
      externalCommentId: "c-1",
    });

    expect(adapter.hiddenCommentIds.has("c-1")).toBe(true);
  });

  it("passes ad origin through normalize", async () => {
    const adapter = new MockChannelAdapter();
    const events = await adapter.normalizeEvent({
      externalEventId: "evt-ad",
      accountId: "acc-1",
      comment: {
        externalCommentId: "c-ad",
        externalPostId: "p-ad",
        authorExternalId: "u-1",
        body: "ad spam",
        origin: "ad",
        adExternalId: "ad_1",
      },
    });
    expect(events[0]?.comment?.origin).toBe("ad");
    expect(events[0]?.comment?.adExternalId).toBe("ad_1");
  });

  it("does not support delete", async () => {
    const adapter = new MockChannelAdapter();
    await expect(
      adapter.deleteComment({
        organizationId: "org-1",
        accountId: "acc-1",
        externalCommentId: "c-1",
      }),
    ).rejects.toBeInstanceOf(UnsupportedChannelActionError);
  });
});

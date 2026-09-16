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

  it("replies to a comment", async () => {
    const adapter = new MockChannelAdapter();
    const result = await adapter.replyToComment({
      organizationId: "org-1",
      accountId: "acc-1",
      externalCommentId: "c-1",
      text: "Thanks for the feedback",
    });
    expect(result.ok).toBe(true);
    expect(adapter.replies).toHaveLength(1);
    expect(adapter.replies[0]?.text).toBe("Thanks for the feedback");
  });
});

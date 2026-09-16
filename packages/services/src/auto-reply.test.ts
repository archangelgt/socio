import { describe, expect, it } from "vitest";
import { readAutoReplyEnabled, withAutoReplyEnabled } from "./auto-reply";

describe("auto-reply metadata helpers", () => {
  it("reads and writes autoReplyEnabled without dropping other keys", () => {
    expect(readAutoReplyEnabled({})).toBe(false);
    expect(readAutoReplyEnabled({ autoReplyEnabled: true })).toBe(true);

    const enabled = withAutoReplyEnabled(
      { pageId: "123", instagramUsername: "demo" },
      true,
    );
    expect(enabled).toEqual({
      pageId: "123",
      instagramUsername: "demo",
      autoReplyEnabled: true,
    });

    const disabled = withAutoReplyEnabled(enabled, false);
    expect(disabled).toEqual({
      pageId: "123",
      instagramUsername: "demo",
    });
  });
});

import { describe, expect, it } from "vitest";
import { parseModerationResult } from "./schema";

describe("parseModerationResult", () => {
  it("rejects malformed model output", () => {
    expect(() =>
      parseModerationResult({ recommended_action: "explode" }),
    ).toThrow();
  });
});

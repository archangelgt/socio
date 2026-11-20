import { describe, expect, it } from "vitest";
import { DEFAULT_ES_EVAL_FIXTURES } from "./eval";

describe("DEFAULT_ES_EVAL_FIXTURES", () => {
  it("includes hide and allow labels for GT Spanish", () => {
    expect(DEFAULT_ES_EVAL_FIXTURES.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_ES_EVAL_FIXTURES.some((row) => row.expectHide)).toBe(true);
    expect(DEFAULT_ES_EVAL_FIXTURES.some((row) => !row.expectHide)).toBe(true);
    expect(
      DEFAULT_ES_EVAL_FIXTURES.every((row) => row.locale === "es-GT"),
    ).toBe(true);
  });
});

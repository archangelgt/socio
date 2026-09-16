import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  resolveQueueOrder,
  resolveQueuePage,
  resolveQueuePageSize,
  resolveQueueSeverity,
  resolveQueueSort,
  resolveQueueStatuses,
  severityRank,
} from "./moderation-queue-query";

describe("moderation queue query helpers", () => {
  it("maps status buckets and raw queue states", () => {
    expect(resolveQueueStatuses("review")).toEqual([
      "PENDING",
      "REVIEW_REQUIRED",
    ]);
    expect(resolveQueueStatuses("AUTO_HIDDEN")).toEqual(["AUTO_HIDDEN"]);
    expect(resolveQueueStatuses("nope")).toBeUndefined();
  });

  it("validates severity and sort defaults", () => {
    expect(resolveQueueSeverity("HIGH")).toBe("HIGH");
    expect(resolveQueueSeverity("LOUD")).toBeUndefined();
    expect(resolveQueueSort("confidence")).toBe("confidence");
    expect(resolveQueueSort("nope")).toBe("createdAt");
    expect(resolveQueueOrder("asc")).toBe("asc");
    expect(resolveQueueOrder("down")).toBe("desc");
  });

  it("clamps pagination", () => {
    expect(resolveQueuePage(0)).toBe(1);
    expect(resolveQueuePage(3.9)).toBe(3);
    expect(resolveQueuePageSize(0)).toBe(25);
    expect(resolveQueuePageSize(500)).toBe(100);
  });

  it("escapes LIKE wildcards and ranks severity", () => {
    expect(escapeLikePattern("100%_off")).toBe("100\\%\\_off");
    expect(severityRank("CRITICAL")).toBeGreaterThan(severityRank("LOW"));
    expect(severityRank(null)).toBe(-1);
  });
});

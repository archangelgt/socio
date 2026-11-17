import { describe, expect, it } from "vitest";
import { caseKindFromCategories, computeUrgency } from "./urgency";

describe("computeUrgency", () => {
  it("marks threats red", () => {
    expect(
      computeUrgency({
        severity: "LOW",
        categories: [{ name: "threat" }],
      }),
    ).toBe("RED");
  });

  it("marks complaints yellow", () => {
    expect(
      computeUrgency({
        severity: "NONE",
        categories: [{ name: "complaint" }],
      }),
    ).toBe("YELLOW");
  });

  it("defaults to green", () => {
    expect(
      computeUrgency({
        severity: "NONE",
        categories: [{ name: "safe" }],
      }),
    ).toBe("GREEN");
  });
});

describe("caseKindFromCategories", () => {
  it("detects scam and complaint", () => {
    expect(caseKindFromCategories([{ name: "scam" }])).toBe("scam");
    expect(caseKindFromCategories([{ name: "complaint" }])).toBe("complaint");
  });
});

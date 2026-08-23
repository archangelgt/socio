import { describe, expect, it } from "vitest";
import { planAmountCents } from "./plans";

describe("planAmountCents", () => {
  it("charges ten months for annual billing", () => {
    expect(planAmountCents("team", "monthly")).toBe(7900);
    expect(planAmountCents("team", "annual")).toBe(79000);
  });
});

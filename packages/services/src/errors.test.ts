import { describe, expect, it } from "vitest";
import { AppError, getAppError, isUniqueViolation } from "./errors";

describe("errors", () => {
  it("unwraps AppError from a wrapped cause", () => {
    const inner = new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    const wrapped = new Error("wrapped");
    wrapped.cause = inner;
    const found = getAppError(wrapped);
    expect(found?.code).toBe("UNAUTHENTICATED");
    expect(found?.statusCode).toBe(401);
  });

  it("detects unique violations nested in cause", () => {
    const pg = Object.assign(new Error("duplicate"), { code: "23505" });
    const wrapped = new Error("query failed");
    wrapped.cause = pg;
    expect(isUniqueViolation(wrapped)).toBe(true);
  });
});

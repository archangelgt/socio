import { describe, expect, it } from "vitest";
import { roleAtLeast } from "./rbac";

describe("roleAtLeast", () => {
  it("allows OWNER to perform ADMIN work", () => {
    expect(roleAtLeast("OWNER", "ADMIN")).toBe(true);
  });

  it("does not allow VIEWER to moderate", () => {
    expect(roleAtLeast("VIEWER", "MODERATOR")).toBe(false);
  });
});

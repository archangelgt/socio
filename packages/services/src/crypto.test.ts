import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  verifyPassword,
} from "./crypto";
import { slugify } from "./slug";

describe("crypto", () => {
  it("round-trips encrypted secrets", () => {
    const encoded = encryptSecret("page-token", "local-secret");
    expect(decryptSecret(encoded, "local-secret")).toBe("page-token");
  });

  it("hashes and verifies passwords", async () => {
    const hashed = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hashed)).toBe(true);
    expect(await verifyPassword("wrong", hashed)).toBe(false);
  });
});

describe("slugify", () => {
  it("builds url-safe slugs", () => {
    expect(slugify("Acme Brand!")).toBe("acme-brand");
  });
});

import { describe, expect, it } from "vitest";
import { createCheckoutSession } from "./checkout";

describe("createCheckoutSession", () => {
  it("returns a same-site mock URL when Tilopay is not configured", async () => {
    const result = await createCheckoutSession({
      planId: "team",
      interval: "annual",
      email: "owner@example.com",
      organizationName: "Acme",
      successUrl: "http://localhost:5173/app",
      cancelUrl: "http://localhost:5173/es/checkout",
      env: { PAYMENT_PROVIDER: "tilopay" },
    });
    expect(result.provider).toBe("tilopay");
    expect(result.configured).toBe(false);
    expect(result.amountCents).toBe(79000);
    expect(result.url).toContain("/app");
    expect(result.url).toContain("checkout=ok");
  });

  it("posts to Tilopay and uses the returned checkout URL", async () => {
    const result = await createCheckoutSession({
      planId: "start",
      interval: "monthly",
      email: "owner@example.com",
      organizationName: "Acme",
      successUrl: "http://localhost:5173/app",
      cancelUrl: "http://localhost:5173/es/checkout",
      env: {
        PAYMENT_PROVIDER: "tilopay",
        TILOPAY_API_KEY: "k",
        TILOPAY_API_USER: "u",
        TILOPAY_API_PASSWORD: "p",
        TILOPAY_API_URL: "https://tilopay.test/pay",
      },
      fetchImpl: (async (url) => {
        expect(String(url)).toBe("https://tilopay.test/pay");
        return new Response(
          JSON.stringify({ url: "https://pay.tilopay.test/abc" }),
          {
            status: 200,
          },
        );
      }) as typeof fetch,
    });
    expect(result.url).toBe("https://pay.tilopay.test/abc");
    expect(result.configured).toBe(true);
  });
});

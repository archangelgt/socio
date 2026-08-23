import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("api", () => {
  it("returns health", async () => {
    const app = await buildApp({
      sessionSecret: "test-session-secret-32-characters!",
      webOrigin: "http://localhost:5173",
      logger: false,
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "api" });
    await app.close();
  });

  it("returns public checkout config", async () => {
    const app = await buildApp({
      sessionSecret: "test-session-secret-32-characters!",
      webOrigin: "http://localhost:5173",
      logger: false,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/checkout/config",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ provider: "mock" });
    await app.close();
  });

  it("maps missing database on /auth/me to 503", async () => {
    const app = await buildApp({
      sessionSecret: "test-session-secret-32-characters!",
      webOrigin: "http://localhost:5173",
      logger: false,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "DATABASE_UNAVAILABLE" },
    });
    await app.close();
  });

  it("rejects Meta webhook handshake without verify token", async () => {
    const app = await buildApp({
      sessionSecret: "test-session-secret-32-characters!",
      webOrigin: "http://localhost:5173",
      logger: false,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42",
    });
    expect(response.statusCode).toBe(501);
    await app.close();
  });
});

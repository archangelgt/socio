import { createDb } from "@social-ai/db";
import type { MetaConfig } from "@social-ai/services";
import { buildApp, buildRuntime } from "./app";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3001);
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret =
  process.env.SESSION_SECRET ?? "dev-session-secret-change-me-32";
const tokenKey = process.env.TOKEN_ENCRYPTION_KEY ?? "dev-token-key-change-me";

const meta: MetaConfig | undefined = (() => {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const verifyToken = process.env.META_VERIFY_TOKEN ?? "";
  if (!appId && !appSecret && !verifyToken) {
    return undefined;
  }
  return {
    appId,
    appSecret,
    verifyToken,
    redirectUri:
      process.env.META_OAUTH_REDIRECT_URI ??
      "http://localhost:3001/api/v1/channels/oauth/meta/callback",
    graphVersion: process.env.META_GRAPH_VERSION ?? "v21.0",
  };
})();

const db = databaseUrl ? createDb(databaseUrl) : undefined;
const ctx = db ? buildRuntime(db, tokenKey, meta) : undefined;

const app = await buildApp({
  ctx,
  sessionSecret,
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
});

await app.listen({ host, port });




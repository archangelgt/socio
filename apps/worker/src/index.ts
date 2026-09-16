import { createAIProvider } from "@social-ai/ai";
import { createDb } from "@social-ai/db";
import {
  QUEUE_INBOUND_EVENTS,
  QUEUE_MODERATION,
  QUEUE_OUTBOUND_ACTIONS,
} from "@social-ai/domain";
import {
  type MetaConfig,
  createInlineRuntime,
  syncAllInstagramComments,
} from "@social-ai/services";

const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;
const tokenKey = process.env.TOKEN_ENCRYPTION_KEY ?? "dev-token-key-change-me";
const pollMs = Number(process.env.META_COMMENT_POLL_MS ?? 120_000);

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
    loginConfigId: process.env.META_LOGIN_CONFIG_ID || undefined,
  };
})();

if (!redisUrl) {
  console.info(
    "[worker] Redis is not configured. The API processes moderation inline for local V1.",
    {
      queues: [QUEUE_INBOUND_EVENTS, QUEUE_MODERATION, QUEUE_OUTBOUND_ACTIONS],
    },
  );
} else {
  console.info(
    "[worker] Redis configured; BullMQ consumers land in the next slice. Comment poller is active.",
    { redisUrl: redisUrl.replace(/:[^:@/]+@/, ":***@") },
  );
}

if (!databaseUrl || !meta) {
  console.info(
    "[worker] Skipping Instagram comment poller (DATABASE_URL or Meta env missing).",
  );
  setInterval(() => {
    /* keep process alive */
  }, 60_000);
} else {
  const db = createDb(databaseUrl);
  const ctx = createInlineRuntime(
    {
      db,
      tokenKey,
      ai: createAIProvider(process.env),
      meta,
    },
    "await",
  );

  let running = false;
  const poll = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await syncAllInstagramComments(ctx);
      if (result.ingested > 0) {
        console.info("[worker] Instagram comment poller ingested", result);
      }
    } catch (error) {
      console.error(
        "[worker] Instagram comment poller failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };

  console.info("[worker] Instagram comment poller every", pollMs, "ms");
  void poll();
  setInterval(() => {
    void poll();
  }, pollMs);
}

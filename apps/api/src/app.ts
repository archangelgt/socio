import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { MockAIProvider } from "@social-ai/ai";
import { isMetaProvider, metaWebhookChallenge } from "@social-ai/channels";
import type { Database } from "@social-ai/db";
import {
  AppError,
  type MetaConfig,
  type ServiceContext,
  completeMetaOAuth,
  connectMockChannel,
  createInlineRuntime,
  getAppError,
  getPost,
  getPostPreview,
  humanModerate,
  hydrateMissingPostMedia,
  ingestWebhook,
  isUniqueViolation,
  listBrands,
  listChannels,
  listComments,
  listConversations,
  listModerationQueue,
  loginUser,
  logoutSession,
  registerUser,
  requireMembership,
  resolveSession,
  startMetaOAuth,
  syncInstagramComments,
} from "@social-ai/services";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, z } from "zod";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const COOKIE = "sid";

function summarizeWebhookPayload(payload: unknown) {
  if (payload === null || typeof payload !== "object") {
    return { object: null, entries: [] as const };
  }
  const body = payload as Record<string, unknown>;
  const entries = Array.isArray(body.entry) ? body.entry : [];
  return {
    object: typeof body.object === "string" ? body.object : null,
    entries: entries.flatMap((raw) => {
      if (raw === null || typeof raw !== "object") {
        return [];
      }
      const entry = raw as Record<string, unknown>;
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      return [
        {
          id: typeof entry.id === "string" ? entry.id : null,
          fields: changes.flatMap((change) => {
            if (change === null || typeof change !== "object") {
              return [];
            }
            const field = (change as Record<string, unknown>).field;
            return typeof field === "string" ? [field] : [];
          }),
          messaging: Array.isArray(entry.messaging)
            ? entry.messaging.length
            : 0,
        },
      ];
    }),
  };
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const connectMockSchema = z.object({
  brandId: z.string().uuid(),
  displayName: z.string().min(1),
  externalAccountId: z.string().min(1),
});

export type AppOptions = {
  ctx?: ServiceContext;
  sessionSecret: string;
  webOrigin: string;
  logger?: boolean;
};

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  });
}

function requireCtx(ctx: ServiceContext | undefined): ServiceContext {
  if (!ctx) {
    throw new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "Database is not configured.",
    );
  }
  return ctx;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
  });
  await app.register(cookie);

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const text = typeof body === "string" ? body : body.toString("utf8");
      request.rawBody = text;
      if (!text) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(text) as unknown);
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    const appError = getAppError(error);
    if (appError) {
      return reply.status(appError.statusCode).send({
        error: { code: appError.code, message: appError.message },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Invalid request",
        },
      });
    }
    if (isUniqueViolation(error)) {
      return reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: "That record already exists.",
        },
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
    });
  });

  app.get("/health", async () => ({
    ok: true,
    service: "api",
    metaConfigured: Boolean(
      options.ctx?.meta?.appId &&
        options.ctx?.meta?.appSecret &&
        options.ctx?.meta?.verifyToken,
    ),
  }));

  app.post("/api/v1/auth/register", async (request, reply) => {
    const ctx = requireCtx(options.ctx);
    const body = registerSchema.parse(request.body);
    const result = await registerUser(ctx.db, body);
    setSessionCookie(reply, result.sessionToken);
    return { user: result.user, memberships: result.memberships };
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const ctx = requireCtx(options.ctx);
    const body = loginSchema.parse(request.body);
    const result = await loginUser(ctx.db, body);
    setSessionCookie(reply, result.sessionToken);
    return { user: result.user, memberships: result.memberships };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const ctx = requireCtx(options.ctx);
    await logoutSession(ctx.db, request.cookies?.sid);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const ctx = requireCtx(options.ctx);
    const session = await resolveSession(ctx.db, request.cookies?.sid);
    if (!session) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    }
    return session;
  });

  async function loadSession(request: FastifyRequest) {
    const ctx = requireCtx(options.ctx);
    const session = await resolveSession(ctx.db, request.cookies?.sid);
    if (!session) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    }
    return { ctx, session };
  }

  function orgId(request: FastifyRequest): string | undefined {
    const header = request.headers["x-organization-id"];
    return typeof header === "string" ? header : undefined;
  }

  app.get("/api/v1/organizations", async (request) => {
    const { session } = await loadSession(request);
    return { organizations: session.memberships };
  });

  app.get("/api/v1/brands", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "VIEWER",
    );
    return { brands: await listBrands(ctx.db, membership.organizationId) };
  });

  app.get("/api/v1/channels", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "VIEWER",
    );
    return { channels: await listChannels(ctx.db, membership.organizationId) };
  });

  app.post("/api/v1/channels/:provider/connect", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "ADMIN",
    );
    const params = z.object({ provider: z.string() }).parse(request.params);
    if (isMetaProvider(params.provider)) {
      const body = z.object({ brandId: z.string().uuid() }).parse(request.body);
      return startMetaOAuth(ctx.meta, {
        organizationId: membership.organizationId,
        brandId: body.brandId,
        actorId: session.user.id,
      });
    }
    if (params.provider !== "mock") {
      throw new AppError(
        400,
        "UNSUPPORTED_PROVIDER",
        `Provider "${params.provider}" is not supported.`,
      );
    }
    const body = connectMockSchema.parse(request.body);
    const channel = await connectMockChannel(ctx.db, {
      organizationId: membership.organizationId,
      actorId: session.user.id,
      tokenKey: ctx.tokenKey,
      ...body,
    });
    return { channel };
  });

  app.get(
    "/api/v1/channels/oauth/:provider/callback",
    async (request, reply) => {
      const params = z.object({ provider: z.string() }).parse(request.params);
      const query = z
        .object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
          error_description: z.string().optional(),
        })
        .parse(request.query);
      const target = new URL(options.webOrigin);
      const fail = (message: string) => {
        target.searchParams.set("meta", "error");
        target.searchParams.set("meta_error", message);
        return reply.redirect(target.toString());
      };
      if (!isMetaProvider(params.provider)) {
        return fail("unsupported_provider");
      }
      if (query.error || !query.code || !query.state) {
        return fail(query.error_description ?? query.error ?? "missing_code");
      }
      const ctx = requireCtx(options.ctx);
      try {
        await completeMetaOAuth(ctx.db, ctx.meta, {
          code: query.code,
          state: query.state,
          tokenKey: ctx.tokenKey,
        });
        target.searchParams.set("meta", "connected");
        return reply.redirect(target.toString());
      } catch (error) {
        const appError = getAppError(error);
        return fail(appError?.message ?? "oauth_failed");
      }
    },
  );

  app.get("/api/v1/comments", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "AGENT",
    );
    await hydrateMissingPostMedia(ctx, membership.organizationId);
    return { comments: await listComments(ctx.db, membership.organizationId) };
  });

  app.post("/api/v1/comments/sync", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "MODERATOR",
    );
    return syncInstagramComments(ctx, membership.organizationId);
  });

  app.get("/api/v1/conversations", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "AGENT",
    );
    return {
      conversations: await listConversations(ctx.db, membership.organizationId),
    };
  });

  app.get("/api/v1/posts/:id", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "AGENT",
    );
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const post = await getPost(ctx.db, membership.organizationId, params.id);
    if (!post) {
      throw new AppError(404, "POST_NOT_FOUND", "Post not found.");
    }
    return { post };
  });

  app.get("/api/v1/posts/:id/preview", async (request, reply) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "AGENT",
    );
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const preview = await getPostPreview(
      ctx,
      membership.organizationId,
      params.id,
    );
    return reply
      .type(preview.contentType)
      .header("cache-control", "private, max-age=300")
      .send(preview.bytes);
  });

  app.get("/api/v1/moderation/queue", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "MODERATOR",
    );
    const query = z
      .object({ status: z.string().optional() })
      .parse(request.query);
    await hydrateMissingPostMedia(ctx, membership.organizationId);
    return {
      items: await listModerationQueue(
        ctx.db,
        membership.organizationId,
        query.status,
      ),
    };
  });

  app.post("/api/v1/moderation/decisions/:id/allow", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "MODERATOR",
    );
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await humanModerate(ctx, {
      organizationId: membership.organizationId,
      actorId: session.user.id,
      decisionId: params.id,
      action: "allow",
    });
    return { ok: true };
  });

  app.post("/api/v1/moderation/decisions/:id/hide", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "MODERATOR",
    );
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await humanModerate(ctx, {
      organizationId: membership.organizationId,
      actorId: session.user.id,
      decisionId: params.id,
      action: "hide",
    });
    return { ok: true };
  });

  app.post("/api/v1/moderation/decisions/:id/restore", async (request) => {
    const { ctx, session } = await loadSession(request);
    const membership = requireMembership(
      session.memberships,
      orgId(request),
      "MODERATOR",
    );
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await humanModerate(ctx, {
      organizationId: membership.organizationId,
      actorId: session.user.id,
      decisionId: params.id,
      action: "restore",
    });
    return { ok: true };
  });

  app.get("/api/v1/webhooks/:provider", async (request, reply) => {
    const params = z.object({ provider: z.string() }).parse(request.params);
    if (!isMetaProvider(params.provider)) {
      throw new AppError(404, "UNKNOWN_WEBHOOK", "Unknown webhook provider.");
    }
    const verifyToken =
      options.ctx?.meta?.verifyToken || process.env.META_VERIFY_TOKEN;
    if (!verifyToken) {
      throw new AppError(
        501,
        "META_NOT_CONFIGURED",
        "Set META_VERIFY_TOKEN to verify Meta webhooks.",
      );
    }
    const challenge = metaWebhookChallenge(
      request.query as Record<string, string | string[] | undefined>,
      verifyToken,
    );
    if (challenge === null) {
      throw new AppError(403, "WEBHOOK_FORBIDDEN", "Verify token mismatch.");
    }
    return reply.type("text/plain").send(challenge);
  });

  app.post("/api/v1/webhooks/:provider", async (request) => {
    const ctx = requireCtx(options.ctx);
    const params = z.object({ provider: z.string() }).parse(request.params);
    const signatureHeader = request.headers["x-hub-signature-256"];
    const result = await ingestWebhook(ctx, {
      provider: params.provider,
      payload: request.body,
      rawBody: request.rawBody,
      signature:
        typeof signatureHeader === "string" ? signatureHeader : undefined,
    });
    request.log.info(
      {
        provider: params.provider,
        result,
        summary: summarizeWebhookPayload(request.body),
      },
      "webhook ingested",
    );
    return result;
  });

  return app;
}

export function buildRuntime(
  db: Database,
  tokenKey: string,
  meta?: MetaConfig,
): ServiceContext {
  return createInlineRuntime(
    {
      db,
      tokenKey,
      ai: new MockAIProvider(),
      meta,
    },
    "await",
  );
}

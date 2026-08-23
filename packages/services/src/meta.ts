import {
  type MetaPage,
  buildMetaAuthorizationUrl,
  exchangeMetaCode,
  listMetaPages,
  parseMetaOAuthState,
  signMetaOAuthState,
  subscribeMetaInstagram,
  subscribeMetaPage,
} from "@social-ai/channels";
import { type Database, brands, socialAccounts } from "@social-ai/db";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import type { MetaConfig } from "./context";
import { encryptSecret } from "./crypto";
import { AppError, isUniqueViolation } from "./errors";

function requireMeta(meta: MetaConfig | undefined): MetaConfig {
  if (!meta?.appId || !meta.appSecret || !meta.redirectUri) {
    throw new AppError(
      501,
      "META_NOT_CONFIGURED",
      "Set META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, and META_OAUTH_REDIRECT_URI.",
    );
  }
  return meta;
}

async function requireBrand(
  db: Database,
  organizationId: string,
  brandId: string,
) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(eq(brands.id, brandId), eq(brands.organizationId, organizationId)),
    )
    .limit(1);
  if (!brand) {
    throw new AppError(404, "BRAND_NOT_FOUND", "Brand not found.");
  }
  return brand;
}

export function startMetaOAuth(
  meta: MetaConfig | undefined,
  input: { organizationId: string; brandId: string; actorId: string },
): { authorizationUrl: string } {
  const config = requireMeta(meta);
  const state = signMetaOAuthState(
    {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorId,
    },
    config.appSecret,
  );
  return {
    authorizationUrl: buildMetaAuthorizationUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
      graphVersion: config.graphVersion,
    }),
  };
}

async function upsertConnectedAccount(
  db: Database,
  input: {
    organizationId: string;
    brandId: string;
    actorId: string;
    tokenKey: string;
    provider: "instagram" | "facebook";
    externalAccountId: string;
    displayName: string;
    accessToken: string;
    tokenExpiresAt?: Date;
    metadata: Record<string, unknown>;
  },
) {
  const [existing] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.provider, input.provider),
        eq(socialAccounts.externalAccountId, input.externalAccountId),
        eq(socialAccounts.status, "active"),
      ),
    )
    .limit(1);

  if (existing && existing.organizationId !== input.organizationId) {
    throw new AppError(
      409,
      "CHANNEL_IN_USE",
      "That social account is already connected to another workspace.",
    );
  }

  const encrypted = encryptSecret(input.accessToken, input.tokenKey);

  if (existing) {
    const [updated] = await db
      .update(socialAccounts)
      .set({
        displayName: input.displayName,
        accessTokenEncrypted: encrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        metadataJson: input.metadata,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  try {
    const [created] = await db
      .insert(socialAccounts)
      .values({
        organizationId: input.organizationId,
        brandId: input.brandId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        accessTokenEncrypted: encrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        metadataJson: input.metadata,
        status: "active",
      })
      .returning();
    if (!created) {
      throw new AppError(
        500,
        "CHANNEL_CONNECT_FAILED",
        "Could not connect channel.",
      );
    }
    await writeAudit(db, {
      organizationId: input.organizationId,
      actorType: "user",
      actorId: input.actorId,
      eventType: "channel.connected",
      entityType: "social_account",
      entityId: created.id,
      metadata: { provider: input.provider },
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        "CHANNEL_IN_USE",
        "That social account is already connected to another workspace.",
      );
    }
    throw error;
  }
}

async function connectPage(
  db: Database,
  meta: MetaConfig,
  input: {
    organizationId: string;
    brandId: string;
    actorId: string;
    tokenKey: string;
    page: MetaPage;
    tokenExpiresAt?: Date;
  },
) {
  try {
    await subscribeMetaPage(meta, input.page);
  } catch {
    // App-level Instagram subscriptions can still deliver comments.
  }
  try {
    await subscribeMetaInstagram(meta, input.page);
  } catch {
    // Comment webhooks need Live mode; Graph sync still works in Development.
  }

  const connected = [];
  const facebook = await upsertConnectedAccount(db, {
    organizationId: input.organizationId,
    brandId: input.brandId,
    actorId: input.actorId,
    tokenKey: input.tokenKey,
    provider: "facebook",
    externalAccountId: input.page.id,
    displayName: input.page.name,
    accessToken: input.page.accessToken,
    tokenExpiresAt: input.tokenExpiresAt,
    metadata: {
      pageId: input.page.id,
      instagramUserId: input.page.instagramUserId,
    },
  });
  connected.push({
    id: facebook.id,
    provider: facebook.provider,
    displayName: facebook.displayName,
    externalAccountId: facebook.externalAccountId,
    status: facebook.status,
    brandId: facebook.brandId,
  });

  if (input.page.instagramUserId) {
    const instagram = await upsertConnectedAccount(db, {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorId,
      tokenKey: input.tokenKey,
      provider: "instagram",
      externalAccountId: input.page.instagramUserId,
      displayName: input.page.instagramUsername
        ? `@${input.page.instagramUsername}`
        : `${input.page.name} Instagram`,
      accessToken: input.page.accessToken,
      tokenExpiresAt: input.tokenExpiresAt,
      metadata: {
        pageId: input.page.id,
        instagramUsername: input.page.instagramUsername,
      },
    });
    connected.push({
      id: instagram.id,
      provider: instagram.provider,
      displayName: instagram.displayName,
      externalAccountId: instagram.externalAccountId,
      status: instagram.status,
      brandId: instagram.brandId,
    });
  }

  return connected;
}

export async function completeMetaOAuth(
  db: Database,
  meta: MetaConfig | undefined,
  input: { code: string; state: string; tokenKey: string },
) {
  const config = requireMeta(meta);
  let parsed: ReturnType<typeof parseMetaOAuthState>;
  try {
    parsed = parseMetaOAuthState(input.state, config.appSecret);
  } catch {
    throw new AppError(400, "OAUTH_STATE_INVALID", "OAuth state is invalid.");
  }

  await requireBrand(db, parsed.organizationId, parsed.brandId);

  const tokens = await exchangeMetaCode(config, input.code);
  const pages = await listMetaPages(config, tokens.accessToken);
  if (pages.length === 0) {
    throw new AppError(
      400,
      "NO_FACEBOOK_PAGES",
      "No Facebook Pages were returned. Use a Page admin account with Instagram linked.",
    );
  }

  const tokenExpiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000)
    : undefined;

  const channels = [];
  for (const page of pages) {
    const connected = await connectPage(db, config, {
      organizationId: parsed.organizationId,
      brandId: parsed.brandId,
      actorId: parsed.actorId,
      tokenKey: input.tokenKey,
      page,
      tokenExpiresAt,
    });
    channels.push(...connected);
  }

  return { channels, organizationId: parsed.organizationId };
}

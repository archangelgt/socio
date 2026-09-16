import { type Database, brands, socialAccounts } from "@social-ai/db";
import { and, eq } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import { encryptSecret } from "./crypto";
import { AppError, isUniqueViolation } from "./errors";

export async function connectMockChannel(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    tokenKey: string;
    brandId: string;
    displayName: string;
    externalAccountId: string;
  },
) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, input.brandId),
        eq(brands.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!brand) {
    throw new AppError(404, "BRAND_NOT_FOUND", "Brand not found.");
  }

  getChannelAdapter("mock");

  const prefix = `org:${input.organizationId}:`;
  const externalAccountId = input.externalAccountId.startsWith(prefix)
    ? input.externalAccountId
    : `${prefix}${input.externalAccountId}`;

  const [existingActive] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, input.organizationId),
        eq(socialAccounts.provider, "mock"),
        eq(socialAccounts.status, "active"),
      ),
    )
    .limit(1);

  if (existingActive) {
    return {
      id: existingActive.id,
      provider: existingActive.provider,
      displayName: existingActive.displayName,
      externalAccountId: existingActive.externalAccountId,
      status: existingActive.status,
      brandId: existingActive.brandId,
    };
  }

  const [existingDisconnected] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, input.organizationId),
        eq(socialAccounts.provider, "mock"),
        eq(socialAccounts.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);

  if (existingDisconnected) {
    const [reactivated] = await db
      .update(socialAccounts)
      .set({
        brandId: brand.id,
        displayName: input.displayName,
        accessTokenEncrypted: encryptSecret("mock-token", input.tokenKey),
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, existingDisconnected.id))
      .returning();

    if (!reactivated) {
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
      entityId: reactivated.id,
      metadata: { provider: "mock", reconnected: true },
    });

    return {
      id: reactivated.id,
      provider: reactivated.provider,
      displayName: reactivated.displayName,
      externalAccountId: reactivated.externalAccountId,
      status: reactivated.status,
      brandId: reactivated.brandId,
    };
  }

  try {
    const [account] = await db
      .insert(socialAccounts)
      .values({
        organizationId: input.organizationId,
        brandId: brand.id,
        provider: "mock",
        externalAccountId,
        displayName: input.displayName,
        accessTokenEncrypted: encryptSecret("mock-token", input.tokenKey),
        status: "active",
      })
      .returning();

    if (!account) {
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
      entityId: account.id,
      metadata: { provider: "mock" },
    });

    return {
      id: account.id,
      provider: account.provider,
      displayName: account.displayName,
      externalAccountId: account.externalAccountId,
      status: account.status,
      brandId: account.brandId,
    };
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

export async function listChannels(db: Database, organizationId: string) {
  const rows = await db
    .select({
      id: socialAccounts.id,
      provider: socialAccounts.provider,
      displayName: socialAccounts.displayName,
      externalAccountId: socialAccounts.externalAccountId,
      status: socialAccounts.status,
      brandId: socialAccounts.brandId,
      metadataJson: socialAccounts.metadataJson,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        eq(socialAccounts.status, "active"),
      ),
    );

  return rows.map((row) => {
    const metadata =
      row.metadataJson && typeof row.metadataJson === "object"
        ? (row.metadataJson as Record<string, unknown>)
        : {};
    const pageId =
      typeof metadata.pageId === "string" ? metadata.pageId : undefined;
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.displayName,
      externalAccountId: row.externalAccountId,
      status: row.status,
      brandId: row.brandId,
      pageId: pageId ?? null,
    };
  });
}

export async function disconnectChannel(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    channelId: string;
    tokenKey: string;
  },
) {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, input.channelId),
        eq(socialAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!account) {
    throw new AppError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
  }

  if (account.status === "disconnected") {
    return {
      id: account.id,
      provider: account.provider,
      displayName: account.displayName,
      externalAccountId: account.externalAccountId,
      status: account.status,
      brandId: account.brandId,
    };
  }

  const [updated] = await db
    .update(socialAccounts)
    .set({
      status: "disconnected",
      accessTokenEncrypted: encryptSecret("", input.tokenKey),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, account.id))
    .returning();

  if (!updated) {
    throw new AppError(
      500,
      "CHANNEL_DISCONNECT_FAILED",
      "Could not disconnect channel.",
    );
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "channel.disconnected",
    entityType: "social_account",
    entityId: updated.id,
    metadata: { provider: updated.provider },
  });

  return {
    id: updated.id,
    provider: updated.provider,
    displayName: updated.displayName,
    externalAccountId: updated.externalAccountId,
    status: updated.status,
    brandId: updated.brandId,
  };
}

export async function listBrands(db: Database, organizationId: string) {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
    })
    .from(brands)
    .where(eq(brands.organizationId, organizationId));
}

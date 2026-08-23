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

  const [existing] = await db
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

  if (existing) {
    return {
      id: existing.id,
      provider: existing.provider,
      displayName: existing.displayName,
      externalAccountId: existing.externalAccountId,
      status: existing.status,
      brandId: existing.brandId,
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
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.organizationId, organizationId));

  return rows;
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

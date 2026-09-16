import type { Database } from "@social-ai/db";
import { brands, socialAccounts } from "@social-ai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "./errors";

export type InboxListFilters = {
  socialAccountId?: string;
  brandId?: string;
};

type AccountMeta = {
  pageId?: unknown;
  instagramUserId?: unknown;
};

function pageIdFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const pageId = (metadata as AccountMeta).pageId;
  return typeof pageId === "string" && pageId.trim()
    ? pageId.trim()
    : undefined;
}

export async function assertFiltersInOrg(
  db: Database,
  organizationId: string,
  filters: InboxListFilters,
): Promise<void> {
  if (filters.socialAccountId) {
    const [account] = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, filters.socialAccountId),
          eq(socialAccounts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!account) {
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        "Social account not found in this workspace.",
      );
    }
  }
  if (filters.brandId) {
    const [brand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, filters.brandId),
          eq(brands.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!brand) {
      throw new AppError(
        404,
        "BRAND_NOT_FOUND",
        "Brand not found in this workspace.",
      );
    }
  }
}

/**
 * Expand one social account to its Meta Page + linked Instagram siblings.
 * Mock/unlinked accounts stay a single-id filter.
 */
export async function resolveLinkedAccountIds(
  db: Database,
  organizationId: string,
  socialAccountId: string,
): Promise<string[]> {
  const [seed] = await db
    .select({
      id: socialAccounts.id,
      metadataJson: socialAccounts.metadataJson,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, socialAccountId),
        eq(socialAccounts.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!seed) {
    throw new AppError(
      404,
      "ACCOUNT_NOT_FOUND",
      "Social account not found in this workspace.",
    );
  }

  const pageId = pageIdFromMetadata(seed.metadataJson);
  if (!pageId) {
    return [seed.id];
  }

  const siblings = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        inArray(socialAccounts.status, ["active", "error"]),
        sql`${socialAccounts.metadataJson}->>'pageId' = ${pageId}`,
      ),
    );

  const ids = siblings.map((row) => row.id);
  return ids.length > 0 ? ids : [seed.id];
}

export async function resolveInboxAccountIds(
  db: Database,
  organizationId: string,
  filters: InboxListFilters,
): Promise<string[] | undefined> {
  if (!filters.socialAccountId) {
    return undefined;
  }
  return resolveLinkedAccountIds(db, organizationId, filters.socialAccountId);
}

import { fetchInstagramMedia } from "@social-ai/channels";
import { posts, socialAccounts } from "@social-ai/db";
import { and, eq } from "drizzle-orm";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";

export type SocialPostInput = {
  externalPostId: string;
  body?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaType?: string;
};

export function thumbnailFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const url = (metadata as Record<string, unknown>).thumbnailUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export async function upsertSocialPost(
  ctx: ServiceContext,
  account: typeof socialAccounts.$inferSelect,
  input: SocialPostInput,
): Promise<{ id: string } | undefined> {
  const metadata: Record<string, unknown> = {};
  if (input.thumbnailUrl) {
    metadata.thumbnailUrl = input.thumbnailUrl;
  }
  if (input.mediaType) {
    metadata.mediaType = input.mediaType;
  }

  const [created] = await ctx.db
    .insert(posts)
    .values({
      organizationId: account.organizationId,
      brandId: account.brandId,
      socialAccountId: account.id,
      externalPostId: input.externalPostId,
      body: input.body,
      permalink: input.permalink,
      metadataJson: metadata,
    })
    .onConflictDoNothing()
    .returning();

  const [existing] =
    created !== undefined
      ? [created]
      : await ctx.db
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.socialAccountId, account.id),
              eq(posts.externalPostId, input.externalPostId),
            ),
          )
          .limit(1);

  if (!existing) {
    return;
  }

  const currentMeta =
    existing.metadataJson && typeof existing.metadataJson === "object"
      ? (existing.metadataJson as Record<string, unknown>)
      : {};
  const nextMeta = { ...currentMeta, ...metadata };
  const nextBody = input.body ?? existing.body;
  const nextPermalink = input.permalink ?? existing.permalink;
  const metaChanged =
    thumbnailFromMetadata(nextMeta) !== thumbnailFromMetadata(currentMeta) ||
    nextMeta.mediaType !== currentMeta.mediaType;

  if (
    nextBody !== existing.body ||
    nextPermalink !== existing.permalink ||
    metaChanged
  ) {
    const [updated] = await ctx.db
      .update(posts)
      .set({
        body: nextBody,
        permalink: nextPermalink,
        metadataJson: nextMeta,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  return existing;
}

export async function hydrateMissingPostMedia(
  ctx: ServiceContext,
  organizationId: string,
  postId?: string,
): Promise<void> {
  if (!ctx.meta) {
    return;
  }

  const filters = [
    eq(posts.organizationId, organizationId),
    eq(socialAccounts.provider, "instagram"),
    eq(socialAccounts.status, "active"),
  ];
  if (postId) {
    filters.push(eq(posts.id, postId));
  }

  const rows = await ctx.db
    .select({
      post: posts,
      account: socialAccounts,
    })
    .from(posts)
    .innerJoin(socialAccounts, eq(socialAccounts.id, posts.socialAccountId))
    .where(and(...filters));

  for (const row of rows) {
    if (thumbnailFromMetadata(row.post.metadataJson)) {
      continue;
    }
    try {
      const media = await fetchInstagramMedia(ctx.meta, {
        accessToken: decryptSecret(
          row.account.accessTokenEncrypted,
          ctx.tokenKey,
        ),
        mediaId: row.post.externalPostId,
      });
      if (!media?.thumbnailUrl && !media?.permalink && !media?.caption) {
        continue;
      }
      await upsertSocialPost(ctx, row.account, {
        externalPostId: row.post.externalPostId,
        body: media.caption,
        permalink: media.permalink,
        thumbnailUrl: media.thumbnailUrl,
        mediaType: media.mediaType,
      });
    } catch {
      // Preview can still 404; comments remain usable.
    }
  }
}

export async function getPostPreview(
  ctx: ServiceContext,
  organizationId: string,
  postId: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  await hydrateMissingPostMedia(ctx, organizationId, postId);

  const [row] = await ctx.db
    .select({
      post: posts,
      account: socialAccounts,
    })
    .from(posts)
    .innerJoin(socialAccounts, eq(socialAccounts.id, posts.socialAccountId))
    .where(and(eq(posts.id, postId), eq(posts.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(404, "POST_NOT_FOUND", "Post not found.");
  }

  const url = thumbnailFromMetadata(row.post.metadataJson);
  if (!url) {
    throw new AppError(404, "POST_MEDIA_NOT_FOUND", "No post image yet.");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(
      502,
      "POST_MEDIA_FETCH_FAILED",
      "Could not load the post image.",
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return { bytes, contentType };
}

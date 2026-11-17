import {
  contentPieceDestinations,
  contentPieceVersions,
  contentPieces,
  socialAccounts,
} from "@social-ai/db";
import {
  type ClientAccess,
  type MembershipRole,
  QUEUE_PUBLISH_DESTINATIONS,
  roleAtLeast,
} from "@social-ai/domain";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

function requirePublisher(role: MembershipRole) {
  if (!roleAtLeast(role, "MANAGER")) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "MANAGER or above can schedule publishes.",
    );
  }
}

function firstImageUrl(mediaJson: unknown): string | undefined {
  if (!Array.isArray(mediaJson)) {
    return undefined;
  }
  for (const item of mediaJson) {
    if (item && typeof item === "object") {
      const url = (item as { url?: unknown }).url;
      if (typeof url === "string" && url.startsWith("http")) {
        return url;
      }
    }
  }
  return undefined;
}

export async function schedulePiecePublish(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    pieceId: string;
    socialAccountIds: string[];
    publishNow?: boolean;
  },
) {
  requirePublisher(input.role);
  if (input.socialAccountIds.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Select at least one channel destination.",
    );
  }

  const [piece] = await ctx.db
    .select()
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.id, input.pieceId),
        eq(contentPieces.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!piece) {
    throw new AppError(404, "PIECE_NOT_FOUND", "Content piece not found.");
  }
  assertClientAllowed(input.access, piece.clientId);
  if (piece.status !== "approved") {
    throw new AppError(
      400,
      "PIECE_NOT_APPROVED",
      "Only approved pieces can be published.",
    );
  }

  const accounts = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, input.organizationId),
        inArray(socialAccounts.id, input.socialAccountIds),
        eq(socialAccounts.status, "active"),
      ),
    );
  if (accounts.length !== input.socialAccountIds.length) {
    throw new AppError(
      400,
      "CHANNEL_NOT_FOUND",
      "One or more channels are missing or inactive.",
    );
  }

  const scheduledAt =
    input.publishNow || !piece.scheduledAt ? new Date() : piece.scheduledAt;
  const created = [];

  for (const account of accounts) {
    const [row] = await ctx.db
      .insert(contentPieceDestinations)
      .values({
        organizationId: input.organizationId,
        contentPieceId: piece.id,
        contentPieceVersion: piece.currentVersion,
        socialAccountId: account.id,
        provider: account.provider,
        status: "scheduled",
        scheduledAt,
        timezone: piece.timezone,
      })
      .onConflictDoUpdate({
        target: [
          contentPieceDestinations.contentPieceId,
          contentPieceDestinations.socialAccountId,
        ],
        set: {
          contentPieceVersion: piece.currentVersion,
          status: "scheduled",
          scheduledAt,
          timezone: piece.timezone,
          lastError: null,
          externalPostId: null,
          permalink: null,
          publishedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (row) {
      created.push(row);
      if (scheduledAt.getTime() <= Date.now()) {
        await ctx.queue.add(QUEUE_PUBLISH_DESTINATIONS, { id: row.id });
      }
    }
  }

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "content_piece.publish_scheduled",
    entityType: "content_piece",
    entityId: piece.id,
    metadata: {
      destinations: created.map((item) => item.id),
      publishNow: Boolean(input.publishNow),
    },
  });

  return { destinations: created };
}

export async function listPieceDestinations(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    access: ClientAccess;
    pieceId: string;
  },
) {
  const [piece] = await ctx.db
    .select({
      id: contentPieces.id,
      clientId: contentPieces.clientId,
    })
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.id, input.pieceId),
        eq(contentPieces.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!piece) {
    throw new AppError(404, "PIECE_NOT_FOUND", "Content piece not found.");
  }
  assertClientAllowed(input.access, piece.clientId);

  return ctx.db
    .select({
      id: contentPieceDestinations.id,
      status: contentPieceDestinations.status,
      provider: contentPieceDestinations.provider,
      socialAccountId: contentPieceDestinations.socialAccountId,
      scheduledAt: contentPieceDestinations.scheduledAt,
      externalPostId: contentPieceDestinations.externalPostId,
      permalink: contentPieceDestinations.permalink,
      lastError: contentPieceDestinations.lastError,
      attemptCount: contentPieceDestinations.attemptCount,
      publishedAt: contentPieceDestinations.publishedAt,
      displayName: socialAccounts.displayName,
    })
    .from(contentPieceDestinations)
    .innerJoin(
      socialAccounts,
      eq(socialAccounts.id, contentPieceDestinations.socialAccountId),
    )
    .where(
      and(
        eq(contentPieceDestinations.organizationId, input.organizationId),
        eq(contentPieceDestinations.contentPieceId, input.pieceId),
      ),
    );
}

export async function retryFailedDestination(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    destinationId: string;
  },
) {
  requirePublisher(input.role);
  const [destination] = await ctx.db
    .select({
      destination: contentPieceDestinations,
      clientId: contentPieces.clientId,
    })
    .from(contentPieceDestinations)
    .innerJoin(
      contentPieces,
      eq(contentPieces.id, contentPieceDestinations.contentPieceId),
    )
    .where(
      and(
        eq(contentPieceDestinations.id, input.destinationId),
        eq(contentPieceDestinations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!destination) {
    throw new AppError(
      404,
      "DESTINATION_NOT_FOUND",
      "Publish destination not found.",
    );
  }
  assertClientAllowed(input.access, destination.clientId);
  if (
    destination.destination.status !== "failed" &&
    destination.destination.status !== "needs_mobile"
  ) {
    throw new AppError(
      400,
      "DESTINATION_NOT_RETRYABLE",
      "Only failed or needs_mobile destinations can be retried.",
    );
  }

  await ctx.db
    .update(contentPieceDestinations)
    .set({
      status: "scheduled",
      scheduledAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(contentPieceDestinations.id, input.destinationId));

  await ctx.queue.add(QUEUE_PUBLISH_DESTINATIONS, {
    id: input.destinationId,
  });

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "content_piece.publish_retried",
    entityType: "content_piece_destination",
    entityId: input.destinationId,
  });

  return { ok: true };
}

export async function processDuePublishDestinations(
  ctx: ServiceContext,
): Promise<{ enqueued: number }> {
  const due = await ctx.db
    .select({ id: contentPieceDestinations.id })
    .from(contentPieceDestinations)
    .where(
      and(
        eq(contentPieceDestinations.status, "scheduled"),
        or(
          isNull(contentPieceDestinations.scheduledAt),
          lte(contentPieceDestinations.scheduledAt, new Date()),
        ),
      ),
    )
    .limit(50);

  for (const row of due) {
    await ctx.queue.add(QUEUE_PUBLISH_DESTINATIONS, { id: row.id });
  }
  return { enqueued: due.length };
}

export async function processPublishDestination(
  ctx: ServiceContext,
  destinationId: string,
): Promise<void> {
  const [destination] = await ctx.db
    .select()
    .from(contentPieceDestinations)
    .where(eq(contentPieceDestinations.id, destinationId))
    .limit(1);

  if (!destination || destination.status === "published") {
    return;
  }

  if (
    destination.scheduledAt &&
    destination.scheduledAt.getTime() > Date.now() + 1000
  ) {
    return;
  }

  const [piece] = await ctx.db
    .select()
    .from(contentPieces)
    .where(eq(contentPieces.id, destination.contentPieceId))
    .limit(1);
  const [version] = await ctx.db
    .select()
    .from(contentPieceVersions)
    .where(
      and(
        eq(contentPieceVersions.contentPieceId, destination.contentPieceId),
        eq(contentPieceVersions.version, destination.contentPieceVersion),
      ),
    )
    .limit(1);
  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, destination.socialAccountId))
    .limit(1);

  if (!piece || !version || !account) {
    await ctx.db
      .update(contentPieceDestinations)
      .set({
        status: "failed",
        lastError: "Piece, version, or account missing",
        attemptCount: destination.attemptCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(contentPieceDestinations.id, destinationId));
    return;
  }

  await ctx.db
    .update(contentPieceDestinations)
    .set({
      status: "publishing",
      attemptCount: destination.attemptCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(contentPieceDestinations.id, destinationId));

  const adapter = getChannelAdapter(account.provider, ctx.meta);
  if (!adapter.capabilities().publishPosts) {
    await ctx.db
      .update(contentPieceDestinations)
      .set({
        status: "failed",
        lastError: "Channel does not support publish",
        updatedAt: new Date(),
      })
      .where(eq(contentPieceDestinations.id, destinationId));
    return;
  }

  const accessToken = decryptSecret(account.accessTokenEncrypted, ctx.tokenKey);
  const network = account.provider === "facebook" ? "facebook" : "instagram";
  const imageUrl = firstImageUrl(version.mediaJson);
  const body = version.copyText || piece.title;

  try {
    const result = await adapter.publish({
      organizationId: destination.organizationId,
      accountId: account.externalAccountId,
      body,
      accessToken,
      network,
      imageUrl,
      format: imageUrl ? "feed_image" : "feed_text",
    });

    if (result.needsMobile) {
      await ctx.db
        .update(contentPieceDestinations)
        .set({
          status: "needs_mobile",
          lastError:
            "Instagram feed publish needs a public image URL; finish in the native app or attach media.",
          updatedAt: new Date(),
        })
        .where(eq(contentPieceDestinations.id, destinationId));
      return;
    }

    await ctx.db
      .update(contentPieceDestinations)
      .set({
        status: "published",
        externalPostId: result.externalPostId ?? null,
        permalink: result.permalink ?? null,
        publishedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(contentPieceDestinations.id, destinationId));

    await writeAudit(ctx.db, {
      organizationId: destination.organizationId,
      actorType: "system",
      eventType: "content_piece.published",
      entityType: "content_piece_destination",
      entityId: destinationId,
      metadata: {
        externalPostId: result.externalPostId,
        permalink: result.permalink,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Publish failed";
    await ctx.db
      .update(contentPieceDestinations)
      .set({
        status: "failed",
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(contentPieceDestinations.id, destinationId));
  }
}

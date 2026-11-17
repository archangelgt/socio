import {
  type Database,
  contentPieceVersions,
  contentPieces,
  monthShareFeedback,
  monthShareLinks,
} from "@social-ai/db";
import type { ClientAccess, MembershipRole } from "@social-ai/domain";
import { roleAtLeast } from "@social-ai/domain";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { writeAudit } from "./audit";
import { hashToken, randomToken } from "./crypto";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

const PIECE_STATUSES = [
  "draft",
  "internal_review",
  "client_review",
  "changes_requested",
  "approved",
] as const;

type PieceStatus = (typeof PIECE_STATUSES)[number];

function requireEditor(role: MembershipRole) {
  if (!roleAtLeast(role, "MANAGER")) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "MANAGER or above can edit the calendar.",
    );
  }
}

export async function listContentPieces(
  db: Database,
  input: {
    organizationId: string;
    access: ClientAccess;
    clientId: string;
    yearMonth: string;
  },
) {
  assertClientAllowed(input.access, input.clientId);
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    throw new AppError(400, "VALIDATION_ERROR", "yearMonth must be YYYY-MM.");
  }
  const start = new Date(`${input.yearMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return db
    .select({
      id: contentPieces.id,
      title: contentPieces.title,
      status: contentPieces.status,
      scheduledAt: contentPieces.scheduledAt,
      timezone: contentPieces.timezone,
      currentVersion: contentPieces.currentVersion,
      brandId: contentPieces.brandId,
      clientId: contentPieces.clientId,
    })
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.organizationId, input.organizationId),
        eq(contentPieces.clientId, input.clientId),
        gte(contentPieces.scheduledAt, start),
        lt(contentPieces.scheduledAt, end),
      ),
    )
    .orderBy(asc(contentPieces.scheduledAt));
}

export async function createContentPiece(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    brandId?: string;
    title: string;
    copyText?: string;
    scheduledAt?: string | null;
    timezone?: string;
  },
) {
  requireEditor(input.role);
  assertClientAllowed(input.access, input.clientId);
  const title = input.title.trim();
  if (!title) {
    throw new AppError(400, "VALIDATION_ERROR", "Title is required.");
  }

  const [piece] = await db
    .insert(contentPieces)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      brandId: input.brandId,
      title,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
      timezone: input.timezone?.trim() || "America/Guatemala",
      createdByUserId: input.actorId,
    })
    .returning();

  if (!piece) {
    throw new AppError(500, "PIECE_CREATE_FAILED", "Could not create piece.");
  }

  await db.insert(contentPieceVersions).values({
    organizationId: input.organizationId,
    contentPieceId: piece.id,
    version: 1,
    copyText: input.copyText?.trim() ?? "",
    createdByUserId: input.actorId,
  });

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "content_piece.created",
    entityType: "content_piece",
    entityId: piece.id,
  });

  return piece;
}

export async function updateContentPieceStatus(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    pieceId: string;
    status: string;
  },
) {
  if (!(PIECE_STATUSES as readonly string[]).includes(input.status)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid piece status.");
  }
  if (
    input.status === "approved" ||
    input.status === "changes_requested" ||
    input.status === "client_review"
  ) {
    if (!roleAtLeast(input.role, "VIEWER")) {
      throw new AppError(403, "FORBIDDEN", "Not allowed to review pieces.");
    }
  } else {
    requireEditor(input.role);
  }

  const [piece] = await db
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

  const [updated] = await db
    .update(contentPieces)
    .set({
      status: input.status as PieceStatus,
      updatedAt: new Date(),
    })
    .where(eq(contentPieces.id, piece.id))
    .returning();

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "content_piece.status_updated",
    entityType: "content_piece",
    entityId: piece.id,
    metadata: { status: input.status },
  });

  return updated;
}

export async function createMonthShareLink(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    access: ClientAccess;
    clientId: string;
    yearMonth: string;
    label?: string;
    expiresAt?: string | null;
  },
) {
  requireEditor(input.role);
  assertClientAllowed(input.access, input.clientId);
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    throw new AppError(400, "VALIDATION_ERROR", "yearMonth must be YYYY-MM.");
  }

  const token = randomToken();
  const [link] = await db
    .insert(monthShareLinks)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      yearMonth: input.yearMonth,
      tokenHash: hashToken(token),
      label: input.label?.trim() || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByUserId: input.actorId,
    })
    .returning({
      id: monthShareLinks.id,
      yearMonth: monthShareLinks.yearMonth,
      expiresAt: monthShareLinks.expiresAt,
      label: monthShareLinks.label,
    });

  if (!link) {
    throw new AppError(
      500,
      "SHARE_LINK_FAILED",
      "Could not create share link.",
    );
  }

  return { ...link, token };
}

export async function getSharedMonth(db: Database, token: string) {
  const [link] = await db
    .select()
    .from(monthShareLinks)
    .where(eq(monthShareLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!link || link.revokedAt) {
    throw new AppError(404, "SHARE_NOT_FOUND", "Share link not found.");
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "SHARE_EXPIRED", "Share link has expired.");
  }

  const pieces = await listContentPieces(db, {
    organizationId: link.organizationId,
    access: { mode: "restricted", clientIds: [link.clientId] },
    clientId: link.clientId,
    yearMonth: link.yearMonth,
  });

  const feedback = await db
    .select({
      id: monthShareFeedback.id,
      guestName: monthShareFeedback.guestName,
      body: monthShareFeedback.body,
      contentPieceId: monthShareFeedback.contentPieceId,
      createdAt: monthShareFeedback.createdAt,
    })
    .from(monthShareFeedback)
    .where(eq(monthShareFeedback.monthShareLinkId, link.id))
    .orderBy(asc(monthShareFeedback.createdAt));

  return {
    yearMonth: link.yearMonth,
    label: link.label,
    pieces: pieces.filter((piece) =>
      ["client_review", "approved", "changes_requested"].includes(piece.status),
    ),
    feedback,
  };
}

export async function addShareFeedback(
  db: Database,
  input: {
    token: string;
    guestName: string;
    body: string;
    contentPieceId?: string;
  },
) {
  const name = input.guestName.trim();
  const body = input.body.trim();
  if (!name || !body) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Name and comment are required.",
    );
  }

  const [share] = await db
    .select()
    .from(monthShareLinks)
    .where(eq(monthShareLinks.tokenHash, hashToken(input.token)))
    .limit(1);

  if (!share || share.revokedAt) {
    throw new AppError(404, "SHARE_NOT_FOUND", "Share link not found.");
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "SHARE_EXPIRED", "Share link has expired.");
  }

  const [row] = await db
    .insert(monthShareFeedback)
    .values({
      organizationId: share.organizationId,
      monthShareLinkId: share.id,
      contentPieceId: input.contentPieceId,
      guestName: name,
      body,
    })
    .returning();

  return row;
}

import {
  type Database,
  brands,
  comments,
  memberships,
  users,
} from "@social-ai/db";
import type { ClientAccess } from "@social-ai/domain";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

const CASE_KINDS = ["none", "attention", "complaint", "scam"] as const;
type CaseKind = (typeof CASE_KINDS)[number];

async function loadComment(
  db: Database,
  organizationId: string,
  commentId: string,
  access: ClientAccess,
) {
  const [row] = await db
    .select({
      id: comments.id,
      clientId: brands.clientId,
      assignedUserId: comments.assignedUserId,
      caseKind: comments.caseKind,
      attentionDueAt: comments.attentionDueAt,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }
  assertClientAllowed(access, row.clientId);
  return row;
}

export async function listAssignableMembers(
  db: Database,
  organizationId: string,
) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(users.name);
}

export async function assignComment(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    access: ClientAccess;
    commentId: string;
    assignedUserId: string | null;
  },
) {
  await loadComment(db, input.organizationId, input.commentId, input.access);

  if (input.assignedUserId) {
    const [member] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.userId, input.assignedUserId),
        ),
      )
      .limit(1);
    if (!member) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Assignee must be an organization member.",
      );
    }
  }

  await db
    .update(comments)
    .set({
      assignedUserId: input.assignedUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    );

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "comment.assigned",
    entityType: "comment",
    entityId: input.commentId,
    metadata: { assignedUserId: input.assignedUserId },
  });

  return {
    commentId: input.commentId,
    assignedUserId: input.assignedUserId,
  };
}

export async function updateCommentCase(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    access: ClientAccess;
    commentId: string;
    caseKind: string;
    attentionDueAt?: string | null;
  },
) {
  if (!(CASE_KINDS as readonly string[]).includes(input.caseKind)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid case kind.");
  }
  const caseKind = input.caseKind as CaseKind;
  await loadComment(db, input.organizationId, input.commentId, input.access);

  let attentionDueAt: Date | null;
  if (input.attentionDueAt === undefined) {
    attentionDueAt =
      caseKind === "complaint" ||
      caseKind === "scam" ||
      caseKind === "attention"
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : null;
  } else if (input.attentionDueAt === null || input.attentionDueAt === "") {
    attentionDueAt = null;
  } else {
    const parsed = new Date(input.attentionDueAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid attentionDueAt.");
    }
    attentionDueAt = parsed;
  }

  await db
    .update(comments)
    .set({
      caseKind,
      attentionDueAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    );

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "comment.case_updated",
    entityType: "comment",
    entityId: input.commentId,
    metadata: {
      caseKind,
      attentionDueAt: attentionDueAt?.toISOString() ?? null,
    },
  });

  return {
    commentId: input.commentId,
    caseKind,
    attentionDueAt,
  };
}

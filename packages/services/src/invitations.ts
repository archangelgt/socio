import { type Database, invitations, memberships } from "@social-ai/db";
import {
  MEMBERSHIP_ROLES,
  type MembershipRole,
  canManageClients,
} from "@social-ai/domain";
import { and, eq, isNull } from "drizzle-orm";
import { writeAudit } from "./audit";
import { hashToken, randomToken } from "./crypto";
import { AppError } from "./errors";
import { setMembershipClientScopes } from "./members";

const INVITE_DAYS = 14;

function parseRole(role: string): MembershipRole {
  if ((MEMBERSHIP_ROLES as readonly string[]).includes(role)) {
    return role as MembershipRole;
  }
  throw new AppError(400, "VALIDATION_ERROR", `Invalid role "${role}".`);
}

export async function createInvitation(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    actorRole: MembershipRole;
    email: string;
    role: string;
    clientIds?: string[];
  },
) {
  if (!canManageClients(input.actorRole)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only OWNER or ADMIN can invite members.",
    );
  }
  const role = parseRole(input.role);
  if (role === "OWNER" && input.actorRole !== "OWNER") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an OWNER can invite another OWNER.",
    );
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new AppError(400, "VALIDATION_ERROR", "Email is required.");
  }

  const token = randomToken();
  const [created] = await db
    .insert(invitations)
    .values({
      organizationId: input.organizationId,
      email,
      role,
      clientIds: input.clientIds ?? [],
      tokenHash: hashToken(token),
      invitedByUserId: input.actorId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      clientIds: invitations.clientIds,
    });

  if (!created) {
    throw new AppError(500, "INVITE_FAILED", "Could not create invitation.");
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "invitation.created",
    entityType: "invitation",
    entityId: created.id,
    metadata: { email, role },
  });

  return { ...created, token };
}

export async function listInvitations(
  db: Database,
  organizationId: string,
  actorRole: MembershipRole,
) {
  if (!canManageClients(actorRole)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only OWNER or ADMIN can list invites.",
    );
  }
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      clientIds: invitations.clientIds,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        isNull(invitations.acceptedAt),
      ),
    );
}

export async function acceptInvitation(
  db: Database,
  input: {
    token: string;
    userId: string;
    userEmail: string;
  },
) {
  const [invite] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(input.token)))
    .limit(1);

  if (!invite || invite.acceptedAt) {
    throw new AppError(404, "INVITE_NOT_FOUND", "Invitation not found.");
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "INVITE_EXPIRED", "Invitation has expired.");
  }
  if (invite.email !== input.userEmail.trim().toLowerCase()) {
    throw new AppError(
      403,
      "INVITE_EMAIL_MISMATCH",
      "Sign in with the invited email to accept.",
    );
  }

  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, invite.organizationId),
        eq(memberships.userId, input.userId),
      ),
    )
    .limit(1);
  if (existing) {
    throw new AppError(
      409,
      "MEMBERSHIP_EXISTS",
      "You already belong to this workspace.",
    );
  }

  const [membership] = await db
    .insert(memberships)
    .values({
      organizationId: invite.organizationId,
      userId: input.userId,
      role: invite.role,
    })
    .returning({ id: memberships.id });

  if (!membership) {
    throw new AppError(
      500,
      "INVITE_ACCEPT_FAILED",
      "Could not join workspace.",
    );
  }

  const clientIds = Array.isArray(invite.clientIds) ? invite.clientIds : [];
  if (clientIds.length > 0) {
    await setMembershipClientScopes(db, {
      organizationId: invite.organizationId,
      membershipId: membership.id,
      actorRole: "ADMIN",
      clientIds,
    });
  }

  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.id, invite.id));

  await writeAudit(db, {
    organizationId: invite.organizationId,
    actorType: "user",
    actorId: input.userId,
    eventType: "invitation.accepted",
    entityType: "invitation",
    entityId: invite.id,
  });

  return {
    organizationId: invite.organizationId,
    membershipId: membership.id,
    role: invite.role,
  };
}

export async function previewInvitation(db: Database, token: string) {
  const [invite] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      organizationId: invitations.organizationId,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!invite || invite.acceptedAt) {
    throw new AppError(404, "INVITE_NOT_FOUND", "Invitation not found.");
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "INVITE_EXPIRED", "Invitation has expired.");
  }
  return invite;
}

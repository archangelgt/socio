import {
  type Database,
  membershipScopes,
  memberships,
  users,
} from "@social-ai/db";
import {
  MEMBERSHIP_ROLES,
  type MembershipRole,
  allowedClientIds,
  canManageClients,
} from "@social-ai/domain";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import { grantMembershipClientScope } from "./clients";
import { AppError } from "./errors";
import { loadClientAccessMap } from "./scopes";

export type OrganizationMember = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
  /** null = org-wide */
  clientIds: string[] | null;
};

function assertManageMembers(role: MembershipRole): void {
  if (!canManageClients(role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only OWNER or ADMIN can manage members and access.",
    );
  }
}

function parseRole(role: string): MembershipRole {
  if ((MEMBERSHIP_ROLES as readonly string[]).includes(role)) {
    return role as MembershipRole;
  }
  throw new AppError(400, "VALIDATION_ERROR", `Invalid role "${role}".`);
}

export async function listOrganizationMembers(
  db: Database,
  organizationId: string,
  actorRole: MembershipRole,
): Promise<OrganizationMember[]> {
  assertManageMembers(actorRole);

  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(users.email);

  const roleByMembershipId = new Map(
    rows.map((row) => [row.membershipId, row.role as MembershipRole]),
  );
  const accessMap = await loadClientAccessMap(
    db,
    rows.map((row) => row.membershipId),
    roleByMembershipId,
  );

  return rows.map((row) => {
    const access = accessMap.get(row.membershipId) ?? { mode: "all" as const };
    return {
      membershipId: row.membershipId,
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role as MembershipRole,
      clientIds: allowedClientIds(access),
    };
  });
}

export async function addOrganizationMember(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    actorRole: MembershipRole;
    email: string;
    role: string;
    clientIds?: string[] | null;
  },
): Promise<OrganizationMember> {
  assertManageMembers(input.actorRole);
  const role = parseRole(input.role);
  if (role === "OWNER" && input.actorRole !== "OWNER") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an OWNER can assign the OWNER role.",
    );
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new AppError(400, "VALIDATION_ERROR", "Email is required.");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.status !== "active") {
    throw new AppError(
      404,
      "USER_NOT_FOUND",
      "No active user with that email. Ask them to register first.",
    );
  }

  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.userId, user.id),
      ),
    )
    .limit(1);
  if (existing) {
    throw new AppError(
      409,
      "MEMBERSHIP_EXISTS",
      "That user already belongs to this workspace.",
    );
  }

  const [created] = await db
    .insert(memberships)
    .values({
      organizationId: input.organizationId,
      userId: user.id,
      role,
    })
    .returning({ id: memberships.id, role: memberships.role });

  if (!created) {
    throw new AppError(
      500,
      "MEMBERSHIP_CREATE_FAILED",
      "Could not add member.",
    );
  }

  if (input.clientIds && input.clientIds.length > 0) {
    await setMembershipClientScopes(db, {
      organizationId: input.organizationId,
      membershipId: created.id,
      actorRole: input.actorRole,
      clientIds: input.clientIds,
    });
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "membership.created",
    entityType: "membership",
    entityId: created.id,
    metadata: { userId: user.id, role },
  });

  const members = await listOrganizationMembers(
    db,
    input.organizationId,
    input.actorRole,
  );
  const member = members.find((item) => item.membershipId === created.id);
  if (!member) {
    return {
      membershipId: created.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: created.role as MembershipRole,
      clientIds: input.clientIds?.length ? input.clientIds : null,
    };
  }
  return member;
}

export async function updateOrganizationMemberRole(
  db: Database,
  input: {
    organizationId: string;
    membershipId: string;
    actorId: string;
    actorRole: MembershipRole;
    role: string;
  },
): Promise<OrganizationMember> {
  assertManageMembers(input.actorRole);
  const role = parseRole(input.role);
  if (role === "OWNER" && input.actorRole !== "OWNER") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an OWNER can assign the OWNER role.",
    );
  }

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, input.membershipId),
        eq(memberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!target) {
    throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found.");
  }

  if (target.role === "OWNER" && role !== "OWNER") {
    const owners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.role, "OWNER"),
        ),
      );
    if (owners.length <= 1) {
      throw new AppError(
        400,
        "LAST_OWNER",
        "Cannot demote the last OWNER of this workspace.",
      );
    }
  }

  await db
    .update(memberships)
    .set({ role, updatedAt: new Date() })
    .where(eq(memberships.id, input.membershipId));

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "membership.role_updated",
    entityType: "membership",
    entityId: input.membershipId,
    metadata: { role },
  });

  const members = await listOrganizationMembers(
    db,
    input.organizationId,
    input.actorRole,
  );
  const member = members.find(
    (item) => item.membershipId === input.membershipId,
  );
  if (!member) {
    throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found.");
  }
  return member;
}

export async function setMembershipClientScopes(
  db: Database,
  input: {
    organizationId: string;
    membershipId: string;
    actorRole: MembershipRole;
    clientIds: string[];
  },
): Promise<{ membershipId: string; clientIds: string[] | null }> {
  assertManageMembers(input.actorRole);

  const [target] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, input.membershipId),
        eq(memberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!target) {
    throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found.");
  }

  const unique = [...new Set(input.clientIds.filter(Boolean))];

  await db
    .delete(membershipScopes)
    .where(
      and(
        eq(membershipScopes.membershipId, input.membershipId),
        eq(membershipScopes.organizationId, input.organizationId),
      ),
    );

  for (const clientId of unique) {
    await grantMembershipClientScope(db, {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      clientId,
      actorRole: input.actorRole,
    });
  }

  return {
    membershipId: input.membershipId,
    clientIds: unique.length === 0 ? null : unique,
  };
}

export async function removeOrganizationMember(
  db: Database,
  input: {
    organizationId: string;
    membershipId: string;
    actorId: string;
    actorRole: MembershipRole;
  },
): Promise<void> {
  assertManageMembers(input.actorRole);

  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, input.membershipId),
        eq(memberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Membership not found.");
  }

  if (membership.userId === input.actorId) {
    throw new AppError(
      400,
      "CANNOT_REMOVE_SELF",
      "You cannot remove your own membership.",
    );
  }

  if (membership.role === "OWNER") {
    if (input.actorRole !== "OWNER") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only an OWNER can remove an OWNER.",
      );
    }
    const owners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.role, "OWNER"),
        ),
      );
    if (owners.length <= 1) {
      throw new AppError(
        400,
        "LAST_OWNER",
        "Cannot remove the last OWNER of this workspace.",
      );
    }
  }

  await db
    .delete(membershipScopes)
    .where(eq(membershipScopes.membershipId, input.membershipId));
  await db.delete(memberships).where(eq(memberships.id, input.membershipId));

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "membership.removed",
    entityType: "membership",
    entityId: input.membershipId,
  });
}

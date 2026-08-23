import {
  type Database,
  brands,
  memberships,
  moderationPolicies,
  moderationRules,
  organizations,
  sessions,
  users,
} from "@social-ai/db";
import type { MembershipRole } from "@social-ai/domain";
import { roleAtLeast } from "@social-ai/domain";
import { defaultModerationRules } from "@social-ai/moderation";
import { eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import {
  hashPassword,
  hashToken,
  randomToken,
  sessionExpiry,
  verifyPassword,
} from "./crypto";
import { AppError } from "./errors";
import { uniqueSlug } from "./slug";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

export type MembershipView = {
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
};

async function seedBrandPolicy(
  db: Database,
  organizationId: string,
  brandId: string,
): Promise<void> {
  const [policy] = await db
    .insert(moderationPolicies)
    .values({
      organizationId,
      brandId,
      name: "Default",
      enabled: true,
      confidenceThreshold: 0.9,
    })
    .returning();

  if (!policy) {
    throw new AppError(
      500,
      "POLICY_SEED_FAILED",
      "Could not create default policy.",
    );
  }

  const rules = defaultModerationRules();
  if (rules.length === 0) {
    return;
  }

  await db.insert(moderationRules).values(
    rules.map((rule) => ({
      organizationId,
      moderationPolicyId: policy.id,
      category: rule.category,
      minimumSeverity: rule.minimum_severity,
      minimumConfidence: rule.minimum_confidence,
      action: rule.action,
      requireHuman: rule.require_human,
      enabled: rule.enabled,
    })),
  );
}

export async function registerUser(
  db: Database,
  input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  },
): Promise<{
  user: PublicUser;
  sessionToken: string;
  memberships: MembershipView[];
}> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new AppError(
      409,
      "EMAIL_TAKEN",
      "An account with this email already exists.",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: input.name.trim(),
    })
    .returning();

  if (!user) {
    throw new AppError(500, "REGISTER_FAILED", "Could not create user.");
  }

  const [organization] = await db
    .insert(organizations)
    .values({
      name: input.organizationName.trim(),
      slug: uniqueSlug(input.organizationName),
    })
    .returning();

  if (!organization) {
    throw new AppError(
      500,
      "REGISTER_FAILED",
      "Could not create organization.",
    );
  }

  await db.insert(memberships).values({
    organizationId: organization.id,
    userId: user.id,
    role: "OWNER",
  });

  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: organization.id,
      name: input.organizationName.trim(),
      slug: "default",
    })
    .returning();

  if (!brand) {
    throw new AppError(500, "REGISTER_FAILED", "Could not create brand.");
  }

  await seedBrandPolicy(db, organization.id, brand.id);
  await writeAudit(db, {
    organizationId: organization.id,
    actorType: "user",
    actorId: user.id,
    eventType: "organization.created",
    entityType: "organization",
    entityId: organization.id,
  });

  const sessionToken = randomToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: sessionExpiry(),
  });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    sessionToken,
    memberships: [
      {
        organizationId: organization.id,
        organizationName: organization.name,
        role: "OWNER",
      },
    ],
  };
}

export async function loginUser(
  db: Database,
  input: { email: string; password: string },
): Promise<{
  user: PublicUser;
  sessionToken: string;
  memberships: MembershipView[];
}> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }

  const sessionToken = randomToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: sessionExpiry(),
  });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    sessionToken,
    memberships: await listMemberships(db, user.id),
  };
}

export async function logoutSession(
  db: Database,
  sessionToken: string | undefined,
): Promise<void> {
  if (!sessionToken) {
    return;
  }
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(sessionToken)));
}

export async function listMemberships(
  db: Database,
  userId: string,
): Promise<MembershipView[]> {
  const rows = await db
    .select({
      organizationId: memberships.organizationId,
      organizationName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));

  return rows;
}

export async function resolveSession(
  db: Database,
  sessionToken: string | undefined,
): Promise<{ user: PublicUser; memberships: MembershipView[] } | null> {
  if (!sessionToken) {
    return null;
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(sessionToken)))
    .limit(1);
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.status !== "active") {
    return null;
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
    memberships: await listMemberships(db, user.id),
  };
}

export function requireMembership(
  memberships: MembershipView[],
  organizationId: string | undefined,
  minRole: MembershipRole,
): MembershipView {
  const selected =
    organizationId !== undefined
      ? memberships.find((item) => item.organizationId === organizationId)
      : memberships.length === 1
        ? memberships[0]
        : undefined;

  if (!selected) {
    throw new AppError(
      403,
      "ORGANIZATION_REQUIRED",
      "Provide X-Organization-Id for the workspace you want to use.",
    );
  }

  if (!roleAtLeast(selected.role, minRole)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission for this action.",
    );
  }

  return selected;
}

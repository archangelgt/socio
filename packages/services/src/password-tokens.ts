import {
  type Database,
  authTokens,
  memberships,
  organizations,
  sessions,
  users,
} from "@social-ai/db";
import type { MembershipRole } from "@social-ai/domain";
import { and, eq, isNull } from "drizzle-orm";
import { writeAudit } from "./audit";
import { listMemberships } from "./auth";
import { hashPassword, hashToken, randomToken, sessionExpiry } from "./crypto";
import {
  buildPasswordResetEmail,
  buildWelcomeSetPasswordEmail,
  sendZohoEmail,
  zohoEmailConfigFromEnv,
} from "./email";
import { AppError } from "./errors";

const TOKEN_HOURS = 48;

async function createAuthToken(
  db: Database,
  input: {
    userId: string;
    purpose: "password_reset" | "welcome_set_password";
  },
) {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, input.userId),
        eq(authTokens.purpose, input.purpose),
        isNull(authTokens.usedAt),
      ),
    );

  const token = randomToken();
  const [row] = await db
    .insert(authTokens)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_HOURS * 60 * 60 * 1000),
    })
    .returning({ id: authTokens.id });

  if (!row) {
    throw new AppError(500, "TOKEN_CREATE_FAILED", "Could not create token.");
  }
  return { token, tokenId: row.id };
}

async function loadValidToken(
  db: Database,
  token: string,
  purpose?: "password_reset" | "welcome_set_password",
) {
  const filters = [
    eq(authTokens.tokenHash, hashToken(token)),
    isNull(authTokens.usedAt),
  ];
  if (purpose) {
    filters.push(eq(authTokens.purpose, purpose));
  }
  const [row] = await db
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      purpose: authTokens.purpose,
      expiresAt: authTokens.expiresAt,
      email: users.email,
      name: users.name,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(and(...filters))
    .limit(1);

  if (!row) {
    throw new AppError(404, "TOKEN_INVALID", "This link is invalid or used.");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "TOKEN_EXPIRED", "This link has expired.");
  }
  return row;
}

export async function previewPasswordToken(db: Database, token: string) {
  const row = await loadValidToken(db, token);
  return {
    purpose: row.purpose,
    email: row.email,
    name: row.name,
    expiresAt: row.expiresAt,
  };
}

/** Always returns accepted — no email enumeration. */
export async function requestPasswordReset(
  db: Database,
  input: { email: string; webOrigin: string },
): Promise<{ accepted: true; emailed: boolean }> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { accepted: true, emailed: false };
  }

  const { token, tokenId } = await createAuthToken(db, {
    userId: user.id,
    purpose: "password_reset",
  });
  const resetUrl = new URL(
    `/set-password/${token}`,
    input.webOrigin,
  ).toString();
  const mailer = zohoEmailConfigFromEnv();
  if (!mailer) {
    return { accepted: true, emailed: false };
  }

  const content = buildPasswordResetEmail({
    name: user.name,
    resetUrl,
  });
  await sendZohoEmail(mailer, {
    to: { address: user.email, name: user.name },
    subject: content.subject,
    htmlBody: content.htmlBody,
    textBody: content.textBody,
    clientReference: `reset-${tokenId}`,
  });
  return { accepted: true, emailed: true };
}

export async function completePasswordSet(
  db: Database,
  input: { token: string; password: string },
): Promise<{
  user: { id: string; email: string; name: string };
  sessionToken: string;
  memberships: Awaited<ReturnType<typeof listMemberships>>;
}> {
  if (input.password.length < 8) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Password must be at least 8 characters.",
    );
  }
  const row = await loadValidToken(db, input.token);
  const passwordHash = await hashPassword(input.password);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(eq(authTokens.id, row.id));

  const sessionToken = randomToken();
  await db.insert(sessions).values({
    userId: row.userId,
    tokenHash: hashToken(sessionToken),
    expiresAt: sessionExpiry(),
  });

  const [membership] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, row.userId))
    .limit(1);
  if (membership) {
    await writeAudit(db, {
      organizationId: membership.organizationId,
      actorType: "user",
      actorId: row.userId,
      eventType:
        row.purpose === "welcome_set_password"
          ? "auth.welcome_password_set"
          : "auth.password_reset",
      entityType: "user",
      entityId: row.userId,
    });
  }

  return {
    user: { id: row.userId, email: row.email, name: row.name },
    sessionToken,
    memberships: await listMemberships(db, row.userId),
  };
}

export async function sendWelcomeSetPasswordEmail(
  db: Database,
  input: {
    userId: string;
    webOrigin: string;
    organizationName?: string;
  },
): Promise<{ emailed: boolean; token?: string }> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  }

  const { token, tokenId } = await createAuthToken(db, {
    userId: user.id,
    purpose: "welcome_set_password",
  });
  const setPasswordUrl = new URL(
    `/set-password/${token}`,
    input.webOrigin,
  ).toString();
  const mailer = zohoEmailConfigFromEnv();
  if (!mailer) {
    return { emailed: false, token };
  }

  const content = buildWelcomeSetPasswordEmail({
    name: user.name,
    organizationName: input.organizationName,
    setPasswordUrl,
  });
  await sendZohoEmail(mailer, {
    to: { address: user.email, name: user.name },
    subject: content.subject,
    htmlBody: content.htmlBody,
    textBody: content.textBody,
    clientReference: `welcome-${tokenId}`,
  });
  return { emailed: true, token };
}

/**
 * Ensure a user belongs to a workspace and send welcome set-password mail.
 * Creates the user with a random password if missing.
 */
export async function provisionUserWelcome(
  db: Database,
  input: {
    email: string;
    name: string;
    organizationId: string;
    role?: MembershipRole;
    webOrigin: string;
  },
): Promise<{
  userId: string;
  membershipId: string;
  createdUser: boolean;
  emailed: boolean;
}> {
  const email = input.email.trim().toLowerCase();
  const role = input.role ?? "OWNER";
  let createdUser = false;

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    const passwordHash = await hashPassword(randomToken());
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: input.name.trim(),
        passwordHash,
      })
      .returning();
    if (!created) {
      throw new AppError(500, "USER_CREATE_FAILED", "Could not create user.");
    }
    user = created;
    createdUser = true;
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!org) {
    throw new AppError(404, "ORG_NOT_FOUND", "Workspace not found.");
  }

  let [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, org.id),
        eq(memberships.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    const [createdMembership] = await db
      .insert(memberships)
      .values({
        organizationId: org.id,
        userId: user.id,
        role,
      })
      .returning();
    if (!createdMembership) {
      throw new AppError(
        500,
        "MEMBERSHIP_CREATE_FAILED",
        "Could not attach workspace.",
      );
    }
    membership = createdMembership;
  } else if (membership.role !== role && role === "OWNER") {
    await db
      .update(memberships)
      .set({ role })
      .where(eq(memberships.id, membership.id));
  }

  await writeAudit(db, {
    organizationId: org.id,
    actorType: "system",
    eventType: "auth.welcome_provisioned",
    entityType: "user",
    entityId: user.id,
    metadata: { email, role, createdUser },
  });

  const sent = await sendWelcomeSetPasswordEmail(db, {
    userId: user.id,
    webOrigin: input.webOrigin,
    organizationName: org.name,
  });

  return {
    userId: user.id,
    membershipId: membership.id,
    createdUser,
    emailed: sent.emailed,
  };
}

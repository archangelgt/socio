import {
  type Database,
  brands,
  clients,
  membershipScopes,
} from "@social-ai/db";
import {
  type ClientAccess,
  type MembershipRole,
  canManageClients,
} from "@social-ai/domain";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { assertClientAllowed, clientScopeIds } from "./scopes";
import { uniqueSlug } from "./slug";

export async function listClients(
  db: Database,
  organizationId: string,
  access: ClientAccess,
) {
  const scope = clientScopeIds(access);
  const filters = [eq(clients.organizationId, organizationId)];
  if (scope !== null) {
    if (scope.length === 0) {
      return [];
    }
    filters.push(inArray(clients.id, scope));
  }

  return db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      status: clients.status,
    })
    .from(clients)
    .where(and(...filters))
    .orderBy(clients.name);
}

export async function createClient(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    role: MembershipRole;
    name: string;
    slug?: string;
  },
) {
  if (!canManageClients(input.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only OWNER or ADMIN can create clients.",
    );
  }

  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "VALIDATION_ERROR", "Client name is required.");
  }

  const slug = (input.slug?.trim() || uniqueSlug(name)).toLowerCase();
  const [created] = await db
    .insert(clients)
    .values({
      organizationId: input.organizationId,
      name,
      slug,
    })
    .returning({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      status: clients.status,
    });

  if (!created) {
    throw new AppError(500, "CLIENT_CREATE_FAILED", "Could not create client.");
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "client.created",
    entityType: "client",
    entityId: created.id,
    metadata: { slug: created.slug },
  });

  return created;
}

export async function grantMembershipClientScope(
  db: Database,
  input: {
    organizationId: string;
    membershipId: string;
    clientId: string;
    actorRole: MembershipRole;
  },
) {
  if (!canManageClients(input.actorRole)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only OWNER or ADMIN can grant client scopes.",
    );
  }

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.id, input.clientId),
        eq(clients.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!client) {
    throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found.");
  }

  const [row] = await db
    .insert(membershipScopes)
    .values({
      membershipId: input.membershipId,
      organizationId: input.organizationId,
      clientId: input.clientId,
    })
    .onConflictDoNothing()
    .returning({
      id: membershipScopes.id,
      membershipId: membershipScopes.membershipId,
      clientId: membershipScopes.clientId,
    });

  return (
    row ?? {
      id: null as string | null,
      membershipId: input.membershipId,
      clientId: input.clientId,
    }
  );
}

export async function listBrandsForAccess(
  db: Database,
  organizationId: string,
  access: ClientAccess,
  clientId?: string,
) {
  if (clientId) {
    assertClientAllowed(access, clientId);
  }

  const scope = clientScopeIds(access);
  const filters = [eq(brands.organizationId, organizationId)];
  if (clientId) {
    filters.push(eq(brands.clientId, clientId));
  } else if (scope !== null) {
    if (scope.length === 0) {
      return [];
    }
    filters.push(inArray(brands.clientId, scope));
  }

  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      clientId: brands.clientId,
    })
    .from(brands)
    .where(and(...filters))
    .orderBy(brands.name);
}

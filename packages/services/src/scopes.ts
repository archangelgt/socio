import {
  type Database,
  brands,
  clients,
  membershipScopes,
  socialAccounts,
} from "@social-ai/db";
import {
  type ClientAccess,
  type MembershipRole,
  allowedClientIds,
  isClientAllowed,
  resolveClientAccess,
} from "@social-ai/domain";
import { and, eq, inArray } from "drizzle-orm";
import { AppError } from "./errors";

export type { ClientAccess };

export async function loadClientAccess(
  db: Database,
  membershipId: string,
  role: MembershipRole,
): Promise<ClientAccess> {
  const rows = await db
    .select({ clientId: membershipScopes.clientId })
    .from(membershipScopes)
    .where(eq(membershipScopes.membershipId, membershipId));

  return resolveClientAccess(
    role,
    rows.map((row) => row.clientId),
  );
}

export async function loadClientAccessMap(
  db: Database,
  membershipIds: string[],
  roleByMembershipId: Map<string, MembershipRole>,
): Promise<Map<string, ClientAccess>> {
  const result = new Map<string, ClientAccess>();
  if (membershipIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      membershipId: membershipScopes.membershipId,
      clientId: membershipScopes.clientId,
    })
    .from(membershipScopes)
    .where(inArray(membershipScopes.membershipId, membershipIds));

  const byMembership = new Map<string, string[]>();
  for (const id of membershipIds) {
    byMembership.set(id, []);
  }
  for (const row of rows) {
    const list = byMembership.get(row.membershipId) ?? [];
    list.push(row.clientId);
    byMembership.set(row.membershipId, list);
  }

  for (const [membershipId, clientIds] of byMembership) {
    const role = roleByMembershipId.get(membershipId) ?? "VIEWER";
    result.set(membershipId, resolveClientAccess(role, clientIds));
  }
  return result;
}

export function assertClientAllowed(
  access: ClientAccess,
  clientId: string,
): void {
  if (!isClientAllowed(access, clientId)) {
    throw new AppError(
      403,
      "CLIENT_FORBIDDEN",
      "You do not have access to this client.",
    );
  }
}

export async function assertBrandInAccess(
  db: Database,
  input: {
    organizationId: string;
    brandId: string;
    access: ClientAccess;
  },
): Promise<{ id: string; clientId: string; organizationId: string }> {
  const [brand] = await db
    .select({
      id: brands.id,
      clientId: brands.clientId,
      organizationId: brands.organizationId,
    })
    .from(brands)
    .where(
      and(
        eq(brands.id, input.brandId),
        eq(brands.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!brand) {
    throw new AppError(404, "BRAND_NOT_FOUND", "Brand not found.");
  }
  assertClientAllowed(input.access, brand.clientId);
  return brand;
}

export async function assertChannelInAccess(
  db: Database,
  input: {
    organizationId: string;
    channelId: string;
    access: ClientAccess;
  },
): Promise<void> {
  const [row] = await db
    .select({
      id: socialAccounts.id,
      clientId: brands.clientId,
    })
    .from(socialAccounts)
    .innerJoin(brands, eq(brands.id, socialAccounts.brandId))
    .where(
      and(
        eq(socialAccounts.id, input.channelId),
        eq(socialAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new AppError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
  }
  assertClientAllowed(input.access, row.clientId);
}

export async function assertClientInOrg(
  db: Database,
  organizationId: string,
  clientId: string,
): Promise<{ id: string; name: string; slug: string }> {
  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
    })
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
    )
    .limit(1);

  if (!client) {
    throw new AppError(404, "CLIENT_NOT_FOUND", "Client not found.");
  }
  return client;
}

/** Drizzle-friendly predicate helper: null = no extra filter. */
export function clientScopeIds(access: ClientAccess): string[] | null {
  return allowedClientIds(access);
}

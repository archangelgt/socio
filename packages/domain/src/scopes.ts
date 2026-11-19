import type { MembershipRole } from "./rbac";
import { roleAtLeast } from "./rbac";

/**
 * Client-level access derived from membership_scopes.
 * - `all`: membership has no scope rows (OWNER/ADMIN explicitly org-wide;
 *   other roles keep backward-compatible org-wide access).
 * - `restricted`: only the listed client ids are visible/actionable.
 */
export type ClientAccess =
  | { mode: "all" }
  | { mode: "restricted"; clientIds: readonly string[] };

export function resolveClientAccess(
  _role: MembershipRole,
  scopedClientIds: readonly string[],
): ClientAccess {
  const unique = [...new Set(scopedClientIds.filter(Boolean))];
  if (unique.length === 0) {
    // Documented rule: OWNER/ADMIN with no scopes see every client.
    // Lower roles without scopes remain org-wide for existing members.
    // `_role` reserved if we later deny unscoped non-admins.
    return { mode: "all" };
  }
  return { mode: "restricted", clientIds: unique };
}

/** True when OWNER/ADMIN (or any role) with no grants retains full org access. */
export function isOrgWideAccess(access: ClientAccess): boolean {
  return access.mode === "all";
}

export function isClientAllowed(
  access: ClientAccess,
  clientId: string,
): boolean {
  if (access.mode === "all") {
    return true;
  }
  return access.clientIds.includes(clientId);
}

/**
 * Optional SQL/in-memory filter: `null` means no client_id predicate (all).
 * Empty array means no clients are allowed (deny-all restricted membership).
 */
export function allowedClientIds(access: ClientAccess): string[] | null {
  if (access.mode === "all") {
    return null;
  }
  return [...access.clientIds];
}

export function filterByClientAccess<T>(
  rows: readonly T[],
  access: ClientAccess,
  getClientId: (row: T) => string,
): T[] {
  if (access.mode === "all") {
    return [...rows];
  }
  const allowed = new Set(access.clientIds);
  return rows.filter((row) => allowed.has(getClientId(row)));
}

/** OWNER/ADMIN may create clients / manage unscoped memberships. */
export function canManageClients(role: MembershipRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

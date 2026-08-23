export const MEMBERSHIP_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "MODERATOR",
  "AGENT",
  "VIEWER",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

const ROLE_RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  AGENT: 1,
  MODERATOR: 2,
  MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function roleAtLeast(
  actual: MembershipRole,
  required: MembershipRole,
): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

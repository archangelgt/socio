import {
  filterByClientAccess,
  isClientAllowed,
  resolveClientAccess,
} from "@social-ai/domain";
import { describe, expect, it } from "vitest";
import { type MembershipView, clientAccessFromMembership } from "./auth";
import { AppError } from "./errors";
import { assertClientAllowed } from "./scopes";

/**
 * Demonstrates piloto isolation: a membership scoped to Client A cannot see
 * Client B data in the same organization. Mirrors API enforcement which uses
 * resolveClientAccess + client_id filters on brands/channels/comments.
 */
describe("membership_scopes client isolation", () => {
  const organizationId = "org-1";
  const clientA = "client-a";
  const clientB = "client-b";

  const scopedMembership: MembershipView = {
    membershipId: "mem-scoped",
    organizationId,
    organizationName: "Agency",
    role: "MANAGER",
    clientIds: [clientA],
  };

  const ownerMembership: MembershipView = {
    membershipId: "mem-owner",
    organizationId,
    organizationName: "Agency",
    role: "OWNER",
    clientIds: null,
  };

  const brands = [
    { id: "brand-a", organizationId, clientId: clientA, name: "Cliente A" },
    { id: "brand-b", organizationId, clientId: clientB, name: "Cliente B" },
  ];

  const channels = [
    {
      id: "ch-a",
      organizationId,
      brandId: "brand-a",
      clientId: clientA,
      displayName: "IG A",
    },
    {
      id: "ch-b",
      organizationId,
      brandId: "brand-b",
      clientId: clientB,
      displayName: "IG B",
    },
  ];

  it("scoped MANAGER only lists Client A brands and channels", () => {
    const access = clientAccessFromMembership(scopedMembership);
    expect(access).toEqual({ mode: "restricted", clientIds: [clientA] });

    const visibleBrands = filterByClientAccess(
      brands,
      access,
      (row) => row.clientId,
    );
    const visibleChannels = filterByClientAccess(
      channels,
      access,
      (row) => row.clientId,
    );

    expect(visibleBrands.map((row) => row.id)).toEqual(["brand-a"]);
    expect(visibleChannels.map((row) => row.id)).toEqual(["ch-a"]);
    expect(isClientAllowed(access, clientB)).toBe(false);
  });

  it("rejects mutations against Client B for a Client A scope", () => {
    const access = clientAccessFromMembership(scopedMembership);
    expect(() => assertClientAllowed(access, clientB)).toThrow(AppError);
    try {
      assertClientAllowed(access, clientB);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("CLIENT_FORBIDDEN");
    }
  });

  it("OWNER without scopes still sees every client in the org", () => {
    const access = clientAccessFromMembership(ownerMembership);
    expect(resolveClientAccess("OWNER", [])).toEqual({ mode: "all" });
    expect(access).toEqual({ mode: "all" });
    expect(
      filterByClientAccess(brands, access, (row) => row.clientId),
    ).toHaveLength(2);
  });
});

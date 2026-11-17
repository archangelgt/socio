import { describe, expect, it } from "vitest";
import {
  allowedClientIds,
  canManageClients,
  filterByClientAccess,
  isClientAllowed,
  resolveClientAccess,
} from "./scopes";

describe("resolveClientAccess", () => {
  it("gives OWNER/ADMIN org-wide access when there are no scopes", () => {
    expect(resolveClientAccess("OWNER", [])).toEqual({ mode: "all" });
    expect(resolveClientAccess("ADMIN", [])).toEqual({ mode: "all" });
  });

  it("keeps lower roles org-wide when unscoped (backward compatible)", () => {
    expect(resolveClientAccess("MANAGER", [])).toEqual({ mode: "all" });
    expect(resolveClientAccess("VIEWER", [])).toEqual({ mode: "all" });
  });

  it("restricts any role that has client scopes", () => {
    expect(resolveClientAccess("VIEWER", ["client-a", "client-a"])).toEqual({
      mode: "restricted",
      clientIds: ["client-a"],
    });
    expect(resolveClientAccess("OWNER", ["client-a", "client-b"])).toEqual({
      mode: "restricted",
      clientIds: ["client-a", "client-b"],
    });
  });
});

describe("client isolation (piloto)", () => {
  const clientA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const clientB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const brands = [
    { id: "brand-a", clientId: clientA, name: "Brand A" },
    { id: "brand-b", clientId: clientB, name: "Brand B" },
  ];

  const channels = [
    { id: "ch-a", clientId: clientA, brandId: "brand-a" },
    { id: "ch-b", clientId: clientB, brandId: "brand-b" },
  ];

  it("scoped user for Client A does not see Client B brands or channels", () => {
    const access = resolveClientAccess("MANAGER", [clientA]);

    expect(isClientAllowed(access, clientA)).toBe(true);
    expect(isClientAllowed(access, clientB)).toBe(false);

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
    expect(allowedClientIds(access)).toEqual([clientA]);
  });

  it("OWNER without scopes sees every client", () => {
    const access = resolveClientAccess("OWNER", []);
    expect(filterByClientAccess(brands, access, (row) => row.clientId)).toEqual(
      brands,
    );
    expect(allowedClientIds(access)).toBeNull();
  });
});

describe("canManageClients", () => {
  it("allows ADMIN and OWNER only", () => {
    expect(canManageClients("OWNER")).toBe(true);
    expect(canManageClients("ADMIN")).toBe(true);
    expect(canManageClients("MANAGER")).toBe(false);
  });
});

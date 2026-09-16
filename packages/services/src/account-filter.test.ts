import { describe, expect, it } from "vitest";

function pageIdFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const pageId = (metadata as { pageId?: unknown }).pageId;
  return typeof pageId === "string" && pageId.trim()
    ? pageId.trim()
    : undefined;
}

function groupChannels(
  channels: Array<{
    id: string;
    provider: string;
    displayName: string;
    pageId: string | null;
  }>,
) {
  const byPage = new Map<string, typeof channels>();
  const singles: typeof channels = [];
  for (const channel of channels) {
    if (channel.pageId) {
      const bucket = byPage.get(channel.pageId) ?? [];
      bucket.push(channel);
      byPage.set(channel.pageId, bucket);
      continue;
    }
    singles.push(channel);
  }
  const groups = [];
  for (const [pageId, members] of byPage) {
    const facebook = members.find((item) => item.provider === "facebook");
    const primary = facebook ?? members[0];
    if (!primary) continue;
    groups.push({
      key: pageId,
      label: facebook?.displayName ?? primary.displayName,
      primaryAccountId: primary.id,
      accountIds: members.map((item) => item.id),
    });
  }
  for (const channel of singles) {
    groups.push({
      key: channel.id,
      label: channel.displayName,
      primaryAccountId: channel.id,
      accountIds: [channel.id],
    });
  }
  return groups;
}

describe("Meta page account grouping", () => {
  it("reads pageId from account metadata", () => {
    expect(pageIdFromMetadata({ pageId: "820516154476141" })).toBe(
      "820516154476141",
    );
    expect(pageIdFromMetadata({})).toBeUndefined();
  });

  it("groups Facebook page with linked Instagram under the page name", () => {
    const groups = groupChannels([
      {
        id: "fb-cadi",
        provider: "facebook",
        displayName: "Asociación CADI",
        pageId: "8205",
      },
      {
        id: "ig-cadi",
        provider: "instagram",
        displayName: "@cadi.gt",
        pageId: "8205",
      },
      {
        id: "mock-1",
        provider: "mock",
        displayName: "Demo Instagram",
        pageId: null,
      },
    ]);
    expect(groups).toHaveLength(2);
    const cadi = groups.find((group) => group.label === "Asociación CADI");
    expect(cadi?.accountIds).toEqual(["fb-cadi", "ig-cadi"]);
    expect(cadi?.primaryAccountId).toBe("fb-cadi");
  });
});

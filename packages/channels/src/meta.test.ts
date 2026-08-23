import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ChannelProviderError } from "./errors";
import { MetaChannelAdapter } from "./meta";
import {
  listInstagramMediaComments,
  matchInstagramComment,
  pickMediaThumbnail,
} from "./meta-graph";
import {
  buildMetaAuthorizationUrl,
  parseMetaOAuthState,
  signMetaOAuthState,
} from "./meta-oauth";
import {
  metaWebhookChallenge,
  normalizeMetaPayload,
  verifyMetaSignature,
} from "./meta-webhook";

const APP_SECRET = "test-app-secret";

function signedBody(body: string) {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

describe("Meta OAuth state", () => {
  it("round-trips a signed state", () => {
    const state = signMetaOAuthState(
      {
        organizationId: "org-1",
        brandId: "brand-1",
        actorId: "user-1",
      },
      "state-secret",
    );
    const parsed = parseMetaOAuthState(state, "state-secret");
    expect(parsed.organizationId).toBe("org-1");
    expect(parsed.brandId).toBe("brand-1");
  });

  it("rejects a tampered state", () => {
    const state = signMetaOAuthState(
      {
        organizationId: "org-1",
        brandId: "brand-1",
        actorId: "user-1",
      },
      "state-secret",
    );
    expect(() => parseMetaOAuthState(`${state}x`, "state-secret")).toThrow();
  });

  it("builds a Facebook dialog URL", () => {
    const url = buildMetaAuthorizationUrl({
      appId: "123",
      redirectUri: "http://localhost:3001/api/v1/channels/oauth/meta/callback",
      state: "abc",
      graphVersion: "v21.0",
    });
    expect(url).toContain("facebook.com/v21.0/dialog/oauth");
    expect(url).toContain("client_id=123");
    expect(url).toContain("instagram_manage_comments");
  });
});

describe("Meta webhooks", () => {
  it("returns the subscription challenge", () => {
    expect(
      metaWebhookChallenge(
        {
          "hub.mode": "subscribe",
          "hub.verify_token": "verify-me",
          "hub.challenge": "42",
        },
        "verify-me",
      ),
    ).toBe("42");
  });

  it("verifies X-Hub-Signature-256", () => {
    const raw = '{"object":"instagram"}';
    expect(verifyMetaSignature(raw, signedBody(raw), APP_SECRET)).toBe(true);
    expect(verifyMetaSignature(raw, signedBody("nope"), APP_SECRET)).toBe(
      false,
    );
  });

  it("normalizes an Instagram comment", () => {
    const events = normalizeMetaPayload({
      object: "instagram",
      entry: [
        {
          id: "17841",
          time: 1_700_000_000,
          changes: [
            {
              field: "comments",
              value: {
                id: "c1",
                text: "this is a scam",
                from: { id: "u1", username: "alex" },
                media: { id: "m1" },
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "instagram",
      accountId: "17841",
      type: "comment.received",
      comment: {
        externalCommentId: "c1",
        externalPostId: "m1",
        body: "this is a scam",
        authorDisplayName: "alex",
      },
    });
  });

  it("normalizes a Facebook page comment and an IG DM", () => {
    const fb = normalizeMetaPayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          time: 1_700_000_000,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "fb-c1",
                post_id: "page-1_p1",
                message: "hate this",
                from: { id: "u2", name: "Sam" },
              },
            },
          ],
        },
      ],
    });
    expect(fb[0]?.provider).toBe("facebook");
    expect(fb[0]?.comment?.externalCommentId).toBe("fb-c1");

    const dm = normalizeMetaPayload({
      object: "instagram",
      entry: [
        {
          id: "17841",
          messaging: [
            {
              sender: { id: "u9" },
              recipient: { id: "17841" },
              timestamp: 1_700_000_000,
              message: { mid: "mid-1", text: "hello" },
            },
          ],
        },
      ],
    });
    expect(dm[0]).toMatchObject({
      type: "message.received",
      message: { body: "hello", direction: "inbound" },
      conversation: { contactExternalId: "u9" },
    });
  });
});

describe("MetaChannelAdapter", () => {
  it("rejects unsigned webhooks", async () => {
    const adapter = new MetaChannelAdapter({
      appSecret: APP_SECRET,
      verifyToken: "verify-me",
      graphVersion: "v21.0",
    });
    await expect(adapter.verifyWebhook({ object: "instagram" })).resolves.toBe(
      false,
    );
    const raw = '{"object":"instagram"}';
    await expect(
      adapter.verifyWebhook({
        rawBody: raw,
        signature: signedBody(raw),
      }),
    ).resolves.toBe(true);
  });

  it("hides an Instagram comment via Graph", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const adapter = new MetaChannelAdapter({
      appSecret: APP_SECRET,
      verifyToken: "verify-me",
      graphVersion: "v21.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await adapter.hideComment({
      organizationId: "org-1",
      accountId: "17841",
      externalCommentId: "c1",
      accessToken: "page-token",
      network: "instagram",
    });
    expect(result.ok).toBe(true);
    const called = JSON.stringify(fetchImpl.mock.calls);
    expect(called).toContain("/v21.0/c1");
    expect(called).toContain("hide=true");
  });

  it("resolves a Graph comment id when the webhook id cannot be hidden", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/m1/comments")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "graph-c1",
                text: "Huecos todos",
                username: "l_potter_g",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (href.includes("/webhook-c1") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              message: "Unsupported post request. Object with ID 'webhook-c1'",
              code: 100,
            },
          }),
          { status: 400 },
        );
      }
      if (href.includes("/graph-c1") && init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "nope" } }), {
        status: 500,
      });
    });
    const adapter = new MetaChannelAdapter({
      appSecret: APP_SECRET,
      verifyToken: "verify-me",
      graphVersion: "v21.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await adapter.hideComment({
      organizationId: "org-1",
      accountId: "17841",
      externalCommentId: "webhook-c1",
      accessToken: "page-token",
      network: "instagram",
      externalPostId: "m1",
      commentBody: "Huecos todos",
      authorDisplayName: "l_potter_g",
    });
    expect(result.externalCommentId).toBe("graph-c1");
    expect(result.externalActionId).toBe("hide-graph-c1");
  });

  it("matches Instagram comments by body when webhook ids differ", () => {
    expect(
      matchInstagramComment(
        [{ id: "graph-c1", text: "Huecos todos", username: "l_potter_g" }],
        {
          commentId: "webhook-c1",
          body: "Huecos todos",
          author: "l_potter_g",
        },
      )?.id,
    ).toBe("graph-c1");
  });

  it("lists Instagram media comments from Graph", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "m1",
              caption: "Reseller post",
              permalink: "https://www.instagram.com/p/abc/",
              media_type: "IMAGE",
              media_url: "https://cdn.example/thumb.jpg",
              comments: {
                data: [
                  {
                    id: "c9",
                    text: "las manos sobre el mantel",
                    username: "andyrmorales",
                    timestamp: "2026-08-22T23:32:00+0000",
                    from: { id: "u3", username: "andyrmorales" },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const comments = await listInstagramMediaComments(
      {
        graphVersion: "v21.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      { accessToken: "page-token", igUserId: "17841" },
    );
    expect(comments).toEqual([
      expect.objectContaining({
        mediaId: "m1",
        commentId: "c9",
        body: "las manos sobre el mantel",
        authorDisplayName: "andyrmorales",
        thumbnailUrl: "https://cdn.example/thumb.jpg",
        permalink: "https://www.instagram.com/p/abc/",
      }),
    ]);
  });

  it("picks image, video, and carousel thumbnails", async () => {
    expect(
      pickMediaThumbnail({
        media_type: "IMAGE",
        media_url: "https://cdn.example/photo.jpg",
      }),
    ).toBe("https://cdn.example/photo.jpg");
    expect(
      pickMediaThumbnail({
        media_type: "VIDEO",
        media_url: "https://cdn.example/video.mp4",
        thumbnail_url: "https://cdn.example/poster.jpg",
      }),
    ).toBe("https://cdn.example/poster.jpg");
    expect(
      pickMediaThumbnail({
        media_type: "CAROUSEL_ALBUM",
        children: {
          data: [{ media_url: "https://cdn.example/slide.jpg" }],
        },
      }),
    ).toBe("https://cdn.example/slide.jpg");
  });

  it("requires a token before calling Graph", async () => {
    const adapter = new MetaChannelAdapter({
      appSecret: APP_SECRET,
      verifyToken: "verify-me",
      graphVersion: "v21.0",
    });
    await expect(
      adapter.hideComment({
        organizationId: "org-1",
        accountId: "17841",
        externalCommentId: "c1",
      }),
    ).rejects.toBeInstanceOf(ChannelProviderError);
  });
});

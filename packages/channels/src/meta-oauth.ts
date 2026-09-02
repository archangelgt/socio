import { createHmac, timingSafeEqual } from "node:crypto";

export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
].join(",");

export type MetaOAuthState = {
  organizationId: string;
  brandId: string;
  actorId: string;
  exp: number;
};

export function signMetaOAuthState(
  state: Omit<MetaOAuthState, "exp">,
  secret: string,
  ttlMs = 15 * 60 * 1000,
): string {
  const payload: MetaOAuthState = {
    ...state,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function parseMetaOAuthState(
  value: string,
  secret: string,
): MetaOAuthState {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    throw new Error("Invalid OAuth state.");
  }
  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Invalid OAuth state signature.");
  }
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as MetaOAuthState;
  if (payload.exp < Date.now()) {
    throw new Error("OAuth state expired.");
  }
  return payload;
}

export function buildMetaAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  graphVersion: string;
  /** Facebook Login for Business configuration ID. Prefer over scope. */
  configId?: string;
}): string {
  const url = new URL(
    `https://www.facebook.com/${input.graphVersion}/dialog/oauth`,
  );
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  if (input.configId) {
    // Login for Business: config_id replaces scope. Scope-only installs fail with
    // "This app needs at least one supported permission" for external users.
    url.searchParams.set("config_id", input.configId);
  } else {
    url.searchParams.set("scope", META_OAUTH_SCOPES);
  }
  return url.toString();
}

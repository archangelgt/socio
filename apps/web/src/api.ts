export type Membership = {
  organizationId: string;
  organizationName: string;
  role: string;
};

export type Session = {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
};

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    organizationId?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.organizationId) {
    headers["X-Organization-Id"] = options.organizationId;
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as T & {
    error?: { message: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Request failed");
  }
  return data;
}

export const api = {
  me: async (): Promise<Session | null> => {
    const response = await fetch("/api/v1/auth/me", {
      credentials: "include",
    });
    if (response.status === 401) {
      return null;
    }
    const text = await response.text();
    const data = (text ? JSON.parse(text) : {}) as Session & {
      error?: { message: string };
    };
    if (!response.ok) {
      throw new Error(data.error?.message ?? "Request failed");
    }
    return data;
  },
  register: (body: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) => request<Session>("/api/v1/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<Session>("/api/v1/auth/login", { method: "POST", body }),
  logout: () => request("/api/v1/auth/logout", { method: "POST" }),
  brands: (organizationId: string) =>
    request<{ brands: { id: string; name: string }[] }>("/api/v1/brands", {
      organizationId,
    }),
  channels: (organizationId: string) =>
    request<{
      channels: {
        id: string;
        provider: string;
        displayName: string;
        externalAccountId: string;
        status: string;
        brandId: string;
      }[];
    }>("/api/v1/channels", { organizationId }),
  connectMock: (
    organizationId: string,
    body: { brandId: string; displayName: string; externalAccountId: string },
  ) =>
    request("/api/v1/channels/mock/connect", {
      method: "POST",
      organizationId,
      body,
    }),
  connectMeta: (organizationId: string, body: { brandId: string }) =>
    request<{ authorizationUrl: string }>("/api/v1/channels/meta/connect", {
      method: "POST",
      organizationId,
      body,
    }),
  comments: (organizationId: string) =>
    request<{
      comments: {
        id: string;
        body: string;
        authorDisplayName: string | null;
        status: string;
        moderationStatus: string;
        severity: string | null;
        aiConfidence: number | null;
        createdAt: string;
        postBody: string | null;
        postPermalink: string | null;
        postThumbnailUrl: string | null;
        postId: string | null;
      }[];
    }>("/api/v1/comments", { organizationId }),
  syncComments: (organizationId: string) =>
    request<{ ingested: number; seen: number }>("/api/v1/comments/sync", {
      method: "POST",
      organizationId,
    }),
  conversations: (organizationId: string) =>
    request<{
      conversations: {
        id: string;
        status: string;
        unread: boolean;
        lastMessageAt: string | null;
        contactName: string | null;
        socialAccountId: string;
        lastMessageBody: string | null;
      }[];
    }>("/api/v1/conversations", { organizationId }),
  queue: (organizationId: string, status?: string) =>
    request<{
      items: {
        decisionId: string;
        commentId: string;
        body: string;
        authorDisplayName: string | null;
        commentStatus: string;
        moderationStatus: string;
        finalAction: string | null;
        severity: string | null;
        confidence: number | null;
        rationale: string | null;
        createdAt: string;
        postId: string | null;
        postThumbnailUrl: string | null;
        postPermalink: string | null;
      }[];
    }>(`/api/v1/moderation/queue${status ? `?status=${status}` : ""}`, {
      organizationId,
    }),
  allow: (organizationId: string, id: string) =>
    request(`/api/v1/moderation/decisions/${id}/allow`, {
      method: "POST",
      organizationId,
    }),
  hide: (organizationId: string, id: string) =>
    request(`/api/v1/moderation/decisions/${id}/hide`, {
      method: "POST",
      organizationId,
    }),
  restore: (organizationId: string, id: string) =>
    request(`/api/v1/moderation/decisions/${id}/restore`, {
      method: "POST",
      organizationId,
    }),
  simulate: (payload: Record<string, unknown>) =>
    request("/api/v1/webhooks/mock", {
      method: "POST",
      body: payload,
    }),
  checkoutConfig: () =>
    request<{ provider: string; configured: boolean }>(
      "/api/v1/checkout/config",
    ),
  createCheckout: (body: {
    planId: string;
    interval: string;
    email: string;
    organizationName: string;
    successUrl: string;
    cancelUrl: string;
  }) =>
    request<{
      url: string;
      provider: string;
      configured: boolean;
      planId: string;
      interval: string;
      amountCents: number;
      currency: string;
    }>("/api/v1/checkout/session", { method: "POST", body }),
};

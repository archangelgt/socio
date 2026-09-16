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
        pageId: string | null;
        autoReplyEnabled: boolean;
      }[];
    }>("/api/v1/channels", { organizationId }),
  setChannelAutoReply: (
    organizationId: string,
    channelId: string,
    body: { enabled: boolean; siblingIds?: string[] },
  ) =>
    request<{
      channel: {
        id: string;
        autoReplyEnabled: boolean;
        updatedChannelIds: string[];
      };
    }>(`/api/v1/channels/${channelId}/auto-reply`, {
      method: "PATCH",
      organizationId,
      body,
    }),
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
  disconnectChannel: (organizationId: string, channelId: string) =>
    request<{
      channel: {
        id: string;
        provider: string;
        displayName: string;
        externalAccountId: string;
        status: string;
        brandId: string;
      };
    }>(`/api/v1/channels/${channelId}`, {
      method: "DELETE",
      organizationId,
    }),
  comments: (
    organizationId: string,
    filters?: { socialAccountId?: string; brandId?: string },
  ) => {
    const params = new URLSearchParams();
    if (filters?.socialAccountId) {
      params.set("socialAccountId", filters.socialAccountId);
    }
    if (filters?.brandId) {
      params.set("brandId", filters.brandId);
    }
    const query = params.toString();
    return request<{
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
        socialAccountId: string;
        brandId: string;
        accountDisplayName: string | null;
        provider: string;
        brandName: string | null;
      }[];
    }>(`/api/v1/comments${query ? `?${query}` : ""}`, { organizationId });
  },
  syncComments: (organizationId: string) =>
    request<{ ingested: number; seen: number }>("/api/v1/comments/sync", {
      method: "POST",
      organizationId,
    }),
  replyToComment: (organizationId: string, commentId: string, text: string) =>
    request<{ ok: boolean }>(`/api/v1/comments/${commentId}/reply`, {
      method: "POST",
      organizationId,
      body: { text },
    }),
  suggestReply: (organizationId: string, commentId: string) =>
    request<{
      suggestion: { text: string; provider: string; model: string };
    }>(`/api/v1/comments/${commentId}/suggest-reply`, {
      method: "POST",
      organizationId,
    }),
  conversations: (
    organizationId: string,
    filters?: { socialAccountId?: string; brandId?: string },
  ) => {
    const params = new URLSearchParams();
    if (filters?.socialAccountId) {
      params.set("socialAccountId", filters.socialAccountId);
    }
    if (filters?.brandId) {
      params.set("brandId", filters.brandId);
    }
    const query = params.toString();
    return request<{
      conversations: {
        id: string;
        status: string;
        unread: boolean;
        lastMessageAt: string | null;
        contactName: string | null;
        socialAccountId: string;
        brandId: string;
        accountDisplayName: string | null;
        provider: string;
        brandName: string | null;
        lastMessageBody: string | null;
      }[];
    }>(`/api/v1/conversations${query ? `?${query}` : ""}`, {
      organizationId,
    });
  },
  queue: (
    organizationId: string,
    filters?: {
      status?: string;
      severity?: string;
      q?: string;
      sort?: string;
      order?: "asc" | "desc";
      page?: number;
      pageSize?: number;
      socialAccountId?: string;
      brandId?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.set("status", filters.status);
    }
    if (filters?.severity) {
      params.set("severity", filters.severity);
    }
    if (filters?.q) {
      params.set("q", filters.q);
    }
    if (filters?.sort) {
      params.set("sort", filters.sort);
    }
    if (filters?.order) {
      params.set("order", filters.order);
    }
    if (filters?.page) {
      params.set("page", String(filters.page));
    }
    if (filters?.pageSize) {
      params.set("pageSize", String(filters.pageSize));
    }
    if (filters?.socialAccountId) {
      params.set("socialAccountId", filters.socialAccountId);
    }
    if (filters?.brandId) {
      params.set("brandId", filters.brandId);
    }
    const query = params.toString();
    return request<{
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
        socialAccountId: string;
        brandId: string;
        accountDisplayName: string | null;
        provider: string;
        brandName: string | null;
      }[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>(`/api/v1/moderation/queue${query ? `?${query}` : ""}`, {
      organizationId,
    });
  },
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

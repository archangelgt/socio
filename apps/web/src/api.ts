export type Membership = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: string;
  /** null = all clients in the org */
  clientIds: string[] | null;
};

export type ClientRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
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
  clients: (organizationId: string) =>
    request<{ clients: ClientRow[] }>("/api/v1/clients", { organizationId }),
  createClient: (
    organizationId: string,
    body: { name: string; slug?: string },
  ) =>
    request<{ client: ClientRow }>("/api/v1/clients", {
      method: "POST",
      organizationId,
      body,
    }),
  members: (organizationId: string) =>
    request<{
      members: {
        membershipId: string;
        userId: string;
        email: string;
        name: string;
        role: string;
        clientIds: string[] | null;
      }[];
    }>("/api/v1/members", { organizationId }),
  addMember: (
    organizationId: string,
    body: { email: string; role: string; clientIds?: string[] },
  ) =>
    request<{
      member: {
        membershipId: string;
        userId: string;
        email: string;
        name: string;
        role: string;
        clientIds: string[] | null;
      };
    }>("/api/v1/members", {
      method: "POST",
      organizationId,
      body,
    }),
  updateMemberRole: (
    organizationId: string,
    membershipId: string,
    role: string,
  ) =>
    request<{
      member: {
        membershipId: string;
        userId: string;
        email: string;
        name: string;
        role: string;
        clientIds: string[] | null;
      };
    }>(`/api/v1/members/${membershipId}`, {
      method: "PATCH",
      organizationId,
      body: { role },
    }),
  removeMember: (organizationId: string, membershipId: string) =>
    request<{ ok: boolean }>(`/api/v1/members/${membershipId}`, {
      method: "DELETE",
      organizationId,
    }),
  setMemberScopes: (
    organizationId: string,
    membershipId: string,
    clientIds: string[],
  ) =>
    request<{
      scope: { membershipId: string; clientIds: string[] | null };
    }>(`/api/v1/memberships/${membershipId}/scopes`, {
      method: "PUT",
      organizationId,
      body: { clientIds },
    }),
  createInvitation: (
    organizationId: string,
    body: { email: string; role: string; clientIds?: string[] },
  ) =>
    request<{
      invitation: {
        id: string;
        email: string;
        role: string;
        token: string;
        expiresAt: string;
      };
    }>("/api/v1/invitations", {
      method: "POST",
      organizationId,
      body,
    }),
  previewInvitation: (token: string) =>
    request<{
      invitation: { email: string; role: string; organizationId: string };
    }>(`/api/v1/auth/invitations/${token}`),
  acceptInvitation: (token: string) =>
    request<{
      organizationId: string;
      membershipId: string;
      role: string;
      memberships: Membership[];
    }>(`/api/v1/auth/invitations/${token}/accept`, { method: "POST" }),
  calendarPieces: (
    organizationId: string,
    clientId: string,
    yearMonth: string,
  ) =>
    request<{
      pieces: {
        id: string;
        title: string;
        status: string;
        scheduledAt: string | null;
        timezone: string;
        currentVersion: number;
      }[];
    }>(
      `/api/v1/calendar/pieces?clientId=${encodeURIComponent(clientId)}&yearMonth=${encodeURIComponent(yearMonth)}`,
      { organizationId },
    ),
  createPiece: (
    organizationId: string,
    body: {
      clientId: string;
      title: string;
      copyText?: string;
      scheduledAt?: string;
    },
  ) =>
    request<{
      piece: { id: string; title: string; status: string };
    }>("/api/v1/calendar/pieces", {
      method: "POST",
      organizationId,
      body,
    }),
  updatePieceStatus: (
    organizationId: string,
    pieceId: string,
    status: string,
  ) =>
    request<{ piece: { id: string; status: string } }>(
      `/api/v1/calendar/pieces/${pieceId}`,
      {
        method: "PATCH",
        organizationId,
        body: { status },
      },
    ),
  createShareLink: (
    organizationId: string,
    body: { clientId: string; yearMonth: string; label?: string },
  ) =>
    request<{
      link: { id: string; yearMonth: string; token: string };
    }>("/api/v1/calendar/share-links", {
      method: "POST",
      organizationId,
      body,
    }),
  sharedMonth: (token: string) =>
    request<{
      yearMonth: string;
      label: string | null;
      pieces: {
        id: string;
        title: string;
        status: string;
        scheduledAt: string | null;
      }[];
      feedback: {
        id: string;
        guestName: string;
        body: string;
        contentPieceId: string | null;
      }[];
    }>(`/api/v1/share/${token}`),
  shareFeedback: (
    token: string,
    body: { guestName: string; body: string; contentPieceId?: string },
  ) =>
    request<{ feedback: { id: string } }>(`/api/v1/share/${token}/feedback`, {
      method: "POST",
      body,
    }),
  setUrgency: (
    organizationId: string,
    commentId: string,
    urgency: string,
    reason: string,
  ) =>
    request(`/api/v1/comments/${commentId}/urgency`, {
      method: "POST",
      organizationId,
      body: { urgency, reason },
    }),
  brands: (organizationId: string, clientId?: string) =>
    request<{
      brands: { id: string; name: string; slug: string; clientId: string }[];
    }>(
      `/api/v1/brands${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
      { organizationId },
    ),
  channels: (organizationId: string, clientId?: string) =>
    request<{
      channels: {
        id: string;
        provider: string;
        displayName: string;
        externalAccountId: string;
        status: string;
        brandId: string;
        clientId: string;
      }[];
    }>(
      `/api/v1/channels${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
      { organizationId },
    ),
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
  comments: (organizationId: string, clientId?: string) =>
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
    }>(
      `/api/v1/comments${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
      { organizationId },
    ),
  syncComments: (organizationId: string) =>
    request<{ ingested: number; seen: number }>("/api/v1/comments/sync", {
      method: "POST",
      organizationId,
    }),
  conversations: (organizationId: string, clientId?: string) =>
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
    }>(
      `/api/v1/conversations${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
      { organizationId },
    ),
  queue: (organizationId: string, status?: string, clientId?: string) => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (clientId) {
      params.set("clientId", clientId);
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
        urgency: string;
        urgencyReason: string | null;
        caseKind: string;
        confidence: number | null;
        rationale: string | null;
        createdAt: string;
        postId: string | null;
        postThumbnailUrl: string | null;
        postPermalink: string | null;
      }[];
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

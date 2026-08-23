import { ChannelProviderError, mapGraphError } from "./errors";

export type MetaGraphConfig = {
  graphVersion: string;
  fetchImpl?: typeof fetch;
};

type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string };
};

export async function graphRequest<T>(
  config: MetaGraphConfig,
  input: {
    method?: "GET" | "POST";
    path: string;
    accessToken?: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, string>;
  },
): Promise<T> {
  const url = new URL(
    `https://graph.facebook.com/${config.graphVersion}${input.path}`,
  );
  if (input.accessToken) {
    url.searchParams.set("access_token", input.accessToken);
  }
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const init: RequestInit = { method: input.method ?? "GET" };
  if (input.body) {
    init.headers = { "content-type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(input.body).toString();
  }

  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new ChannelProviderError(
      "transient",
      error instanceof Error ? error.message : "Graph request failed",
    );
  }

  const json = (await response.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!response.ok || json.error) {
    throw mapGraphError(
      response.status,
      json.error?.code,
      json.error?.message ?? `Graph API ${response.status}`,
    );
  }
  return json;
}

export type MetaPage = {
  id: string;
  name: string;
  accessToken: string;
  instagramUserId?: string;
  instagramUsername?: string;
};

type AccountsResponse = {
  data?: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string };
    connected_instagram_account?: { id: string; username?: string };
  }>;
};

export async function exchangeMetaCode(
  config: MetaGraphConfig & {
    appId: string;
    appSecret: string;
    redirectUri: string;
  },
  code: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const shortLived = await graphRequest<{
    access_token: string;
    expires_in?: number;
  }>(config, {
    path: "/oauth/access_token",
    query: {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code,
    },
  });

  const longLived = await graphRequest<{
    access_token: string;
    expires_in?: number;
  }>(config, {
    path: "/oauth/access_token",
    query: {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLived.access_token,
    },
  });

  return {
    accessToken: longLived.access_token,
    expiresIn: longLived.expires_in,
  };
}

export async function listMetaPages(
  config: MetaGraphConfig,
  userAccessToken: string,
): Promise<MetaPage[]> {
  const response = await graphRequest<AccountsResponse>(config, {
    path: "/me/accounts",
    accessToken: userAccessToken,
    query: {
      fields:
        "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}",
    },
  });

  return (response.data ?? []).map((page) => {
    const ig =
      page.instagram_business_account ?? page.connected_instagram_account;
    return {
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      instagramUserId: ig?.id,
      instagramUsername: ig?.username,
    };
  });
}

export async function subscribeMetaPage(
  config: MetaGraphConfig,
  page: MetaPage,
): Promise<void> {
  await graphRequest(config, {
    method: "POST",
    path: `/${page.id}/subscribed_apps`,
    accessToken: page.accessToken,
    query: {
      subscribed_fields: "feed,mention,messages,message_echoes",
    },
  });
}

export async function subscribeMetaInstagram(
  config: MetaGraphConfig,
  page: MetaPage,
): Promise<void> {
  if (!page.instagramUserId) {
    return;
  }
  await graphRequest(config, {
    method: "POST",
    path: `/${page.instagramUserId}/subscribed_apps`,
    accessToken: page.accessToken,
    query: {
      subscribed_fields: "comments,live_comments,mentions,messages",
    },
  });
}

export async function fetchMetaComment(
  config: MetaGraphConfig,
  input: { accessToken: string; externalCommentId: string },
): Promise<{
  id: string;
  text?: string;
  fromId?: string;
  fromName?: string;
  mediaId?: string;
  parentId?: string;
} | null> {
  try {
    const comment = await graphRequest<{
      id: string;
      text?: string;
      message?: string;
      parent_id?: string;
      from?: { id?: string; name?: string; username?: string };
      media?: { id?: string };
    }>(config, {
      path: `/${input.externalCommentId}`,
      accessToken: input.accessToken,
      query: {
        fields: "id,text,message,timestamp,from,media,parent_id",
      },
    });
    return {
      id: comment.id,
      text: comment.text ?? comment.message,
      fromId: comment.from?.id,
      fromName: comment.from?.name ?? comment.from?.username,
      mediaId: comment.media?.id,
      parentId: comment.parent_id,
    };
  } catch (error) {
    if (error instanceof ChannelProviderError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

export type InstagramCommentRef = {
  id: string;
  text: string;
  username?: string;
  legacyId?: string;
};

type GraphCommentNode = {
  id: string;
  text?: string;
  username?: string;
  legacy_instagram_comment_id?: string;
  from?: { username?: string };
  replies?: { data?: GraphCommentNode[] };
};

function commentRef(row: GraphCommentNode): InstagramCommentRef {
  return {
    id: row.id,
    text: row.text ?? "",
    username: row.from?.username ?? row.username,
    legacyId: row.legacy_instagram_comment_id,
  };
}

function normalizeHandle(value: string | undefined): string {
  return value?.replace(/^@/, "").trim().toLowerCase() ?? "";
}

export function hideCandidateIds(
  comments: InstagramCommentRef[],
  input: { commentId: string; body?: string; author?: string },
): string[] {
  const ids: string[] = [];
  const add = (id?: string) => {
    if (id && id !== input.commentId && !ids.includes(id)) {
      ids.push(id);
    }
  };
  const body = input.body?.trim();
  const author = normalizeHandle(input.author);
  for (const item of comments) {
    const bodyOk = Boolean(body) && item.text.trim() === body;
    const authorOk =
      !author || normalizeHandle(item.username) === author || !item.username;
    if (item.id === input.commentId) {
      add(item.legacyId);
      continue;
    }
    if (bodyOk && authorOk) {
      add(item.id);
      add(item.legacyId);
    }
  }
  return ids;
}

export function matchInstagramComment(
  comments: InstagramCommentRef[],
  input: { commentId: string; body?: string; author?: string },
): InstagramCommentRef | undefined {
  const candidateId = hideCandidateIds(comments, input)[0];
  if (candidateId) {
    return comments.find(
      (item) => item.id === candidateId || item.legacyId === candidateId,
    );
  }
  return comments.find((item) => item.id === input.commentId);
}

export async function listInstagramCommentsOnMedia(
  config: MetaGraphConfig,
  input: { accessToken: string; mediaId: string },
): Promise<InstagramCommentRef[]> {
  const response = await graphRequest<{ data?: GraphCommentNode[] }>(config, {
    path: `/${input.mediaId}/comments`,
    accessToken: input.accessToken,
    query: {
      fields:
        "id,text,username,from,legacy_instagram_comment_id,replies.limit(50){id,text,username,from,legacy_instagram_comment_id}",
      limit: "50",
    },
  });
  const comments: InstagramCommentRef[] = [];
  for (const row of response.data ?? []) {
    comments.push(commentRef(row));
    for (const reply of row.replies?.data ?? []) {
      comments.push(commentRef(reply));
    }
  }
  return comments;
}

async function postInstagramHide(
  config: MetaGraphConfig,
  input: { accessToken: string; commentId: string; hide: boolean },
) {
  const flag = input.hide ? "true" : "false";
  await graphRequest(config, {
    method: "POST",
    path: `/${input.commentId}`,
    accessToken: input.accessToken,
    query: { hide: flag },
    body: { hide: flag },
  });
}

async function collectInstagramCommentRefs(
  config: MetaGraphConfig,
  input: { accessToken: string; mediaId?: string; igUserId?: string },
): Promise<InstagramCommentRef[]> {
  const refs: InstagramCommentRef[] = [];
  const seen = new Set<string>();
  const push = (item: InstagramCommentRef) => {
    const key = `${item.id}:${item.legacyId ?? ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    refs.push(item);
  };
  if (input.mediaId) {
    try {
      const listed = await listInstagramCommentsOnMedia(config, {
        accessToken: input.accessToken,
        mediaId: input.mediaId,
      });
      for (const item of listed) {
        push(item);
      }
    } catch {
      // Try the account media edge next.
    }
  }
  if (input.igUserId) {
    try {
      const listed = await listInstagramMediaComments(config, {
        accessToken: input.accessToken,
        igUserId: input.igUserId,
      });
      for (const item of listed) {
        if (input.mediaId && item.mediaId !== input.mediaId) {
          continue;
        }
        push({
          id: item.commentId,
          text: item.body,
          username: item.authorDisplayName,
          legacyId: item.legacyId,
        });
      }
    } catch {
      // Keep whatever the media comments edge returned.
    }
  }
  return refs;
}

export async function hideOrShowInstagramComment(
  config: MetaGraphConfig,
  input: {
    accessToken: string;
    commentId: string;
    hide: boolean;
    mediaId?: string;
    igUserId?: string;
    body?: string;
    author?: string;
  },
): Promise<string> {
  try {
    await postInstagramHide(config, input);
    return input.commentId;
  } catch (error) {
    if (
      !(error instanceof ChannelProviderError) ||
      (!input.mediaId && !input.igUserId) ||
      (error.code !== "validation_error" &&
        error.code !== "not_found" &&
        error.code !== "forbidden")
    ) {
      throw error;
    }
    const listed = await collectInstagramCommentRefs(config, input);
    const candidates = hideCandidateIds(listed, {
      commentId: input.commentId,
      body: input.body,
      author: input.author,
    });
    try {
      const current = await graphRequest<{
        id?: string;
        legacy_instagram_comment_id?: string;
      }>(config, {
        path: `/${input.commentId}`,
        accessToken: input.accessToken,
        query: { fields: "id,legacy_instagram_comment_id" },
      });
      if (
        current.legacy_instagram_comment_id &&
        current.legacy_instagram_comment_id !== input.commentId &&
        !candidates.includes(current.legacy_instagram_comment_id)
      ) {
        candidates.push(current.legacy_instagram_comment_id);
      }
    } catch {
      // Webhook ids are often not readable as Graph nodes.
    }
    for (const commentId of candidates) {
      try {
        await postInstagramHide(config, {
          accessToken: input.accessToken,
          commentId,
          hide: input.hide,
        });
        return commentId;
      } catch {
        // Try the next Graph id.
      }
    }
    throw new ChannelProviderError(
      error.code,
      `${error.message} Instagram often blocks hide unless the commenter is a Meta app tester or instagram_manage_comments has Advanced Access.`,
      error.status,
    );
  }
}

export type InstagramMediaComment = {
  mediaId: string;
  commentId: string;
  body: string;
  authorExternalId: string;
  authorDisplayName?: string;
  parentId?: string;
  occurredAt: string;
  caption?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaType?: string;
  legacyId?: string;
};

type GraphMediaNode = {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  children?: { data?: GraphMediaNode[] };
};

export function pickMediaThumbnail(media: GraphMediaNode): string | undefined {
  if (media.media_type === "VIDEO" || media.media_type === "REELS") {
    return media.thumbnail_url ?? media.media_url;
  }
  const child = media.children?.data?.[0];
  if (child) {
    return pickMediaThumbnail(child);
  }
  return media.media_url ?? media.thumbnail_url;
}

function parseGraphTime(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export async function listInstagramMediaComments(
  config: MetaGraphConfig,
  input: { accessToken: string; igUserId: string },
): Promise<InstagramMediaComment[]> {
  const response = await graphRequest<{
    data?: Array<{
      id: string;
      caption?: string;
      permalink?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      children?: { data?: GraphMediaNode[] };
      comments?: {
        data?: Array<{
          id: string;
          text?: string;
          username?: string;
          timestamp?: string;
          parent_id?: string;
          from?: { id?: string; username?: string; name?: string };
          legacy_instagram_comment_id?: string;
        }>;
      };
    }>;
  }>(config, {
    path: `/${input.igUserId}/media`,
    accessToken: input.accessToken,
    query: {
      fields:
        "id,caption,media_type,media_url,thumbnail_url,permalink,children{media_url,thumbnail_url,media_type},comments.limit(50){id,text,username,timestamp,from,parent_id,legacy_instagram_comment_id}",
      limit: "8",
    },
  });

  const comments: InstagramMediaComment[] = [];
  for (const media of response.data ?? []) {
    const thumbnailUrl = pickMediaThumbnail(media);
    for (const comment of media.comments?.data ?? []) {
      comments.push({
        mediaId: media.id,
        commentId: comment.id,
        body: comment.text ?? "",
        authorExternalId: comment.from?.id ?? comment.username ?? "unknown",
        authorDisplayName:
          comment.from?.username ?? comment.from?.name ?? comment.username,
        parentId: comment.parent_id,
        occurredAt: parseGraphTime(comment.timestamp),
        caption: media.caption,
        permalink: media.permalink,
        thumbnailUrl,
        mediaType: media.media_type,
        legacyId: comment.legacy_instagram_comment_id,
      });
    }
  }
  return comments;
}

export async function fetchInstagramMedia(
  config: MetaGraphConfig,
  input: { accessToken: string; mediaId: string },
): Promise<{
  id: string;
  caption?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaType?: string;
} | null> {
  try {
    const media = await graphRequest<{
      id: string;
      caption?: string;
      permalink?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      children?: { data?: GraphMediaNode[] };
    }>(config, {
      path: `/${input.mediaId}`,
      accessToken: input.accessToken,
      query: {
        fields:
          "id,caption,media_type,media_url,thumbnail_url,permalink,children{media_url,thumbnail_url,media_type}",
      },
    });
    return {
      id: media.id,
      caption: media.caption,
      permalink: media.permalink,
      thumbnailUrl: pickMediaThumbnail(media),
      mediaType: media.media_type,
    };
  } catch (error) {
    if (error instanceof ChannelProviderError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

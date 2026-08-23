import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizedChannelEvent } from "./types";

export const META_PROVIDERS = ["meta", "instagram", "facebook"] as const;

export function isMetaProvider(provider: string): boolean {
  return (META_PROVIDERS as readonly string[]).includes(provider);
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function metaWebhookChallenge(
  query: Record<string, string | string[] | undefined>,
  verifyToken: string,
): string | null {
  const mode = queryValue(query["hub.mode"]);
  const token = queryValue(query["hub.verify_token"]);
  const challenge = queryValue(query["hub.challenge"]);
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(signatureHeader);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function occurredAt(value: unknown): string {
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function fromName(from: Record<string, unknown> | null): string | undefined {
  return asString(from?.username) ?? asString(from?.name);
}

function normalizeInstagramChange(
  accountId: string,
  time: unknown,
  change: Record<string, unknown>,
): NormalizedChannelEvent | null {
  if (change.field !== "comments") {
    return null;
  }
  const value = asRecord(change.value);
  if (!value) {
    return null;
  }
  const commentId = asString(value.id);
  const media = asRecord(value.media);
  const mediaId = asString(media?.id) ?? asString(value.media_id);
  const from = asRecord(value.from);
  if (!commentId || !mediaId) {
    return null;
  }
  return {
    provider: "instagram",
    accountId,
    externalEventId: `ig:comment:${commentId}`,
    type: "comment.received",
    occurredAt: occurredAt(time),
    post: { externalPostId: mediaId },
    comment: {
      externalCommentId: commentId,
      externalPostId: mediaId,
      parentExternalCommentId: asString(value.parent_id),
      authorExternalId: asString(from?.id) ?? "unknown",
      authorDisplayName: fromName(from),
      body: asString(value.text) ?? "",
    },
  };
}

function normalizeFacebookChange(
  accountId: string,
  time: unknown,
  change: Record<string, unknown>,
): NormalizedChannelEvent | null {
  if (change.field !== "feed") {
    return null;
  }
  const value = asRecord(change.value);
  if (!value || value.item !== "comment" || value.verb === "remove") {
    return null;
  }
  const commentId = asString(value.comment_id);
  const postId = asString(value.post_id) ?? asString(value.parent_id);
  const from = asRecord(value.from);
  if (!commentId || !postId) {
    return null;
  }
  return {
    provider: "facebook",
    accountId,
    externalEventId: `fb:comment:${commentId}`,
    type: value.verb === "edited" ? "comment.updated" : "comment.received",
    occurredAt: occurredAt(time),
    post: { externalPostId: postId },
    comment: {
      externalCommentId: commentId,
      externalPostId: postId,
      parentExternalCommentId: asString(value.parent_id),
      authorExternalId: asString(from?.id) ?? "unknown",
      authorDisplayName: fromName(from),
      body: asString(value.message) ?? "",
    },
  };
}

function normalizeMessaging(
  provider: "instagram" | "facebook",
  accountId: string,
  item: Record<string, unknown>,
): NormalizedChannelEvent | null {
  const sender = asRecord(item.sender);
  const recipient = asRecord(item.recipient);
  const message = asRecord(item.message);
  const senderId = asString(sender?.id);
  const recipientId = asString(recipient?.id);
  const mid = asString(message?.mid);
  if (!senderId || !recipientId || !mid || !message) {
    return null;
  }
  const isEcho = message.is_echo === true;
  const contactId = isEcho ? recipientId : senderId;
  return {
    provider,
    accountId,
    externalEventId: `${provider === "instagram" ? "ig" : "fb"}:message:${mid}`,
    type: isEcho ? "message.sent" : "message.received",
    occurredAt: occurredAt(item.timestamp),
    conversation: {
      externalConversationId: contactId,
      contactExternalId: contactId,
    },
    message: {
      externalMessageId: mid,
      body: asString(message.text) ?? "",
      direction: isEcho ? "outbound" : "inbound",
    },
  };
}

export function normalizeMetaPayload(input: unknown): NormalizedChannelEvent[] {
  const payload = asRecord(input) ?? asRecord(asRecord(input)?.payload);
  if (!payload) {
    return [];
  }
  const object = asString(payload.object);
  const entries = payload.entry;
  if (!Array.isArray(entries)) {
    return [];
  }

  const events: NormalizedChannelEvent[] = [];
  for (const rawEntry of entries) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }
    const accountId = asString(entry.id);
    if (!accountId) {
      continue;
    }

    if (Array.isArray(entry.changes)) {
      for (const rawChange of entry.changes) {
        const change = asRecord(rawChange);
        if (!change) {
          continue;
        }
        const event =
          object === "instagram"
            ? normalizeInstagramChange(accountId, entry.time, change)
            : normalizeFacebookChange(accountId, entry.time, change);
        if (event) {
          events.push(event);
        }
      }
    }

    if (Array.isArray(entry.messaging)) {
      const network = object === "instagram" ? "instagram" : "facebook";
      for (const rawItem of entry.messaging) {
        const item = asRecord(rawItem);
        if (!item) {
          continue;
        }
        const event = normalizeMessaging(network, accountId, item);
        if (event) {
          events.push(event);
        }
      }
    }
  }
  return events;
}

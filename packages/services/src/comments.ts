import type { Database } from "@social-ai/db";
import {
  comments,
  contacts,
  conversations,
  messages,
  posts,
} from "@social-ai/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { thumbnailFromMetadata } from "./posts";

export async function listComments(db: Database, organizationId: string) {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      authorDisplayName: comments.authorDisplayName,
      status: comments.status,
      moderationStatus: comments.moderationStatus,
      severity: comments.severity,
      aiConfidence: comments.aiConfidence,
      createdAt: comments.createdAt,
      postBody: posts.body,
      postPermalink: posts.permalink,
      postMetadata: posts.metadataJson,
      postId: comments.postId,
      externalPostId: comments.externalPostId,
    })
    .from(comments)
    .leftJoin(posts, eq(posts.id, comments.postId))
    .where(eq(comments.organizationId, organizationId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    authorDisplayName: row.authorDisplayName,
    status: row.status,
    moderationStatus: row.moderationStatus,
    severity: row.severity,
    aiConfidence: row.aiConfidence,
    createdAt: row.createdAt,
    postBody: row.postBody,
    postPermalink: row.postPermalink,
    postThumbnailUrl: thumbnailFromMetadata(row.postMetadata),
    postId: row.postId,
    externalPostId: row.externalPostId,
  }));
}

export async function getPost(
  db: Database,
  organizationId: string,
  postId: string,
) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.organizationId, organizationId)))
    .limit(1);
  return post ?? null;
}

export async function listConversations(db: Database, organizationId: string) {
  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      unread: conversations.unread,
      lastMessageAt: conversations.lastMessageAt,
      contactName: contacts.displayName,
      socialAccountId: conversations.socialAccountId,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.organizationId, organizationId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return rows.map((row) => ({
      ...row,
      lastMessageBody: null as string | null,
    }));
  }

  const recent = await db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(desc(messages.createdAt));

  const latest = new Map<string, string>();
  for (const item of recent) {
    if (!latest.has(item.conversationId)) {
      latest.set(item.conversationId, item.body);
    }
  }

  return rows.map((row) => ({
    ...row,
    lastMessageBody: latest.get(row.id) ?? null,
  }));
}

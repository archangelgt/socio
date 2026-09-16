import type { Database } from "@social-ai/db";
import {
  brands,
  comments,
  contacts,
  conversations,
  messages,
  posts,
  socialAccounts,
} from "@social-ai/db";
import { type SQL, and, desc, eq, inArray } from "drizzle-orm";
import {
  type InboxListFilters,
  assertFiltersInOrg,
  resolveInboxAccountIds,
} from "./account-filter";
import { thumbnailFromMetadata } from "./posts";

export type { InboxListFilters } from "./account-filter";

function commentFilters(
  organizationId: string,
  filters: InboxListFilters,
  accountIds?: string[],
): SQL[] {
  const clauses: SQL[] = [eq(comments.organizationId, organizationId)];
  if (accountIds && accountIds.length > 0) {
    clauses.push(inArray(comments.socialAccountId, accountIds));
  }
  if (filters.brandId) {
    clauses.push(eq(comments.brandId, filters.brandId));
  }
  return clauses;
}

export async function listComments(
  db: Database,
  organizationId: string,
  filters: InboxListFilters = {},
) {
  await assertFiltersInOrg(db, organizationId, filters);
  const accountIds = await resolveInboxAccountIds(db, organizationId, filters);

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
      socialAccountId: comments.socialAccountId,
      brandId: comments.brandId,
      accountDisplayName: socialAccounts.displayName,
      provider: socialAccounts.provider,
      brandName: brands.name,
    })
    .from(comments)
    .leftJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, comments.socialAccountId))
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(and(...commentFilters(organizationId, filters, accountIds)))
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
    socialAccountId: row.socialAccountId,
    brandId: row.brandId,
    accountDisplayName: row.accountDisplayName,
    provider: row.provider,
    brandName: row.brandName,
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

export async function listConversations(
  db: Database,
  organizationId: string,
  filters: InboxListFilters = {},
) {
  await assertFiltersInOrg(db, organizationId, filters);
  const accountIds = await resolveInboxAccountIds(db, organizationId, filters);

  const clauses: SQL[] = [eq(conversations.organizationId, organizationId)];
  if (accountIds && accountIds.length > 0) {
    clauses.push(inArray(conversations.socialAccountId, accountIds));
  }
  if (filters.brandId) {
    clauses.push(eq(conversations.brandId, filters.brandId));
  }

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      unread: conversations.unread,
      lastMessageAt: conversations.lastMessageAt,
      contactName: contacts.displayName,
      socialAccountId: conversations.socialAccountId,
      brandId: conversations.brandId,
      accountDisplayName: socialAccounts.displayName,
      provider: socialAccounts.provider,
      brandName: brands.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(
      socialAccounts,
      eq(socialAccounts.id, conversations.socialAccountId),
    )
    .innerJoin(brands, eq(brands.id, conversations.brandId))
    .where(and(...clauses))
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

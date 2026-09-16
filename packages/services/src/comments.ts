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
import { AppError } from "./errors";
import { thumbnailFromMetadata } from "./posts";

export type InboxListFilters = {
  socialAccountId?: string;
  brandId?: string;
};

async function assertFiltersInOrg(
  db: Database,
  organizationId: string,
  filters: InboxListFilters,
): Promise<void> {
  if (filters.socialAccountId) {
    const [account] = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, filters.socialAccountId),
          eq(socialAccounts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!account) {
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        "Social account not found in this workspace.",
      );
    }
  }
  if (filters.brandId) {
    const [brand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, filters.brandId),
          eq(brands.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!brand) {
      throw new AppError(
        404,
        "BRAND_NOT_FOUND",
        "Brand not found in this workspace.",
      );
    }
  }
}

function commentFilters(
  organizationId: string,
  filters: InboxListFilters,
): SQL[] {
  const clauses: SQL[] = [eq(comments.organizationId, organizationId)];
  if (filters.socialAccountId) {
    clauses.push(eq(comments.socialAccountId, filters.socialAccountId));
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
    .where(and(...commentFilters(organizationId, filters)))
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

  const clauses: SQL[] = [eq(conversations.organizationId, organizationId)];
  if (filters.socialAccountId) {
    clauses.push(eq(conversations.socialAccountId, filters.socialAccountId));
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

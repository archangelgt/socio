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
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import {
  type InboxListFilters,
  assertFiltersInOrg,
  resolveInboxAccountIds,
} from "./account-filter";
import {
  type ModerationQueueQuery,
  escapeLikePattern,
  resolveQueueOrder,
  resolveQueuePage,
  resolveQueuePageSize,
  resolveQueueSeverity,
  resolveQueueSort,
  resolveQueueStatuses,
} from "./moderation-queue-query";
import { thumbnailFromMetadata } from "./posts";

export type { InboxListFilters } from "./account-filter";

export type InboxListQuery = ModerationQueueQuery & InboxListFilters;

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
  filters: InboxListQuery = {},
) {
  await assertFiltersInOrg(db, organizationId, filters);
  const accountIds = await resolveInboxAccountIds(db, organizationId, filters);
  const page = resolveQueuePage(filters.page);
  const pageSize = resolveQueuePageSize(filters.pageSize);
  const statuses = resolveQueueStatuses(filters.status);
  const severityFilter = resolveQueueSeverity(filters.severity);
  const sortField = resolveQueueSort(filters.sort);
  const sortOrder = resolveQueueOrder(filters.order);

  const clauses = commentFilters(organizationId, filters, accountIds);
  if (statuses && statuses.length > 0) {
    clauses.push(inArray(comments.moderationStatus, statuses));
  }
  if (severityFilter) {
    clauses.push(eq(comments.severity, severityFilter));
  }
  const queryText = filters.q?.trim();
  if (queryText) {
    const pattern = `%${escapeLikePattern(queryText)}%`;
    const searchClause = or(
      ilike(comments.body, pattern),
      ilike(comments.authorDisplayName, pattern),
      ilike(socialAccounts.displayName, pattern),
      ilike(brands.name, pattern),
    );
    if (searchClause) {
      clauses.push(searchClause);
    }
  }

  const where = and(...clauses);
  const totalRows = await db
    .select({ total: count() })
    .from(comments)
    .innerJoin(socialAccounts, eq(socialAccounts.id, comments.socialAccountId))
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const direction = sortOrder === "asc" ? asc : desc;

  const orderBy =
    sortField === "severity"
      ? [
          direction(
            sql`case ${comments.severity}
            when 'NONE' then 0 when 'LOW' then 1 when 'MEDIUM' then 2
            when 'HIGH' then 3 when 'CRITICAL' then 4 else -1 end`,
          ),
          desc(comments.createdAt),
        ]
      : sortField === "confidence"
        ? [direction(comments.aiConfidence), desc(comments.createdAt)]
        : sortField === "status"
          ? [direction(comments.moderationStatus), desc(comments.createdAt)]
          : sortField === "author"
            ? [direction(comments.authorDisplayName), desc(comments.createdAt)]
            : [direction(comments.createdAt), desc(comments.id)];

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
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  return {
    comments: rows.map((row) => ({
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
    })),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
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
  filters: InboxListQuery = {},
) {
  await assertFiltersInOrg(db, organizationId, filters);
  const accountIds = await resolveInboxAccountIds(db, organizationId, filters);
  const page = resolveQueuePage(filters.page);
  const pageSize = resolveQueuePageSize(filters.pageSize);
  const sortOrder = resolveQueueOrder(filters.order);

  const clauses: SQL[] = [eq(conversations.organizationId, organizationId)];
  if (accountIds && accountIds.length > 0) {
    clauses.push(inArray(conversations.socialAccountId, accountIds));
  }
  if (filters.brandId) {
    clauses.push(eq(conversations.brandId, filters.brandId));
  }
  const queryText = filters.q?.trim();
  if (queryText) {
    const pattern = `%${escapeLikePattern(queryText)}%`;
    const searchClause = or(
      ilike(contacts.displayName, pattern),
      ilike(socialAccounts.displayName, pattern),
      ilike(brands.name, pattern),
    );
    if (searchClause) {
      clauses.push(searchClause);
    }
  }

  const where = and(...clauses);
  const totalRows = await db
    .select({ total: count() })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(
      socialAccounts,
      eq(socialAccounts.id, conversations.socialAccountId),
    )
    .innerJoin(brands, eq(brands.id, conversations.brandId))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const direction = sortOrder === "asc" ? asc : desc;

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
    .where(where)
    .orderBy(direction(conversations.lastMessageAt), desc(conversations.id))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      conversations: rows.map((row) => ({
        ...row,
        lastMessageBody: null as string | null,
      })),
      page: safePage,
      pageSize,
      total,
      totalPages,
    };
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

  return {
    conversations: rows.map((row) => ({
      ...row,
      lastMessageBody: latest.get(row.id) ?? null,
    })),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

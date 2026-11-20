import { type Database, brands, comments, taggings, tags } from "@social-ai/db";
import type { ClientAccess } from "@social-ai/domain";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { writeAudit } from "./audit";
import { AppError, isUniqueViolation } from "./errors";
import { assertClientAllowed } from "./scopes";

async function loadCommentAccess(
  db: Database,
  organizationId: string,
  commentId: string,
  access: ClientAccess,
) {
  const [row] = await db
    .select({
      id: comments.id,
      clientId: brands.clientId,
      brandId: comments.brandId,
    })
    .from(comments)
    .innerJoin(brands, eq(brands.id, comments.brandId))
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }
  assertClientAllowed(access, row.clientId);
  return row;
}

export async function listTags(
  db: Database,
  organizationId: string,
  brandId?: string,
) {
  const brandFilter = brandId
    ? or(isNull(tags.brandId), eq(tags.brandId, brandId))
    : undefined;
  return db
    .select({
      id: tags.id,
      name: tags.name,
      brandId: tags.brandId,
      createdAt: tags.createdAt,
    })
    .from(tags)
    .where(and(eq(tags.organizationId, organizationId), brandFilter))
    .orderBy(tags.name);
}

export async function createTag(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    brandId?: string;
  },
) {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "VALIDATION_ERROR", "Tag name is required.");
  }

  try {
    const [tag] = await db
      .insert(tags)
      .values({
        organizationId: input.organizationId,
        brandId: input.brandId,
        name,
      })
      .returning({
        id: tags.id,
        name: tags.name,
        brandId: tags.brandId,
        createdAt: tags.createdAt,
      });
    if (!tag) {
      throw new AppError(500, "TAG_CREATE_FAILED", "Could not create tag.");
    }
    await writeAudit(db, {
      organizationId: input.organizationId,
      actorType: "user",
      actorId: input.actorId,
      eventType: "tag.created",
      entityType: "tag",
      entityId: tag.id,
      metadata: { name: tag.name, brandId: tag.brandId },
    });
    return tag;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "TAG_EXISTS", "Tag already exists.");
    }
    throw error;
  }
}

export async function listCommentTags(
  db: Database,
  organizationId: string,
  commentId: string,
  access: ClientAccess,
) {
  await loadCommentAccess(db, organizationId, commentId, access);
  return db
    .select({
      id: tags.id,
      name: tags.name,
      brandId: tags.brandId,
      taggingId: taggings.id,
    })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(
      and(
        eq(taggings.organizationId, organizationId),
        eq(taggings.entityType, "comment"),
        eq(taggings.entityId, commentId),
      ),
    )
    .orderBy(tags.name);
}

export async function tagComment(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    access: ClientAccess;
    commentId: string;
    tagId: string;
  },
) {
  await loadCommentAccess(
    db,
    input.organizationId,
    input.commentId,
    input.access,
  );

  const [tag] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(
      and(
        eq(tags.id, input.tagId),
        eq(tags.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!tag) {
    throw new AppError(404, "TAG_NOT_FOUND", "Tag not found.");
  }

  const [row] = await db
    .insert(taggings)
    .values({
      organizationId: input.organizationId,
      tagId: tag.id,
      entityType: "comment",
      entityId: input.commentId,
    })
    .onConflictDoNothing()
    .returning({ id: taggings.id });

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "comment.tagged",
    entityType: "comment",
    entityId: input.commentId,
    metadata: { tagId: tag.id, tagName: tag.name },
  });

  return { taggingId: row?.id ?? null, tag };
}

export async function untagComment(
  db: Database,
  input: {
    organizationId: string;
    actorId: string;
    access: ClientAccess;
    commentId: string;
    tagId: string;
  },
) {
  await loadCommentAccess(
    db,
    input.organizationId,
    input.commentId,
    input.access,
  );

  const deleted = await db
    .delete(taggings)
    .where(
      and(
        eq(taggings.organizationId, input.organizationId),
        eq(taggings.tagId, input.tagId),
        eq(taggings.entityType, "comment"),
        eq(taggings.entityId, input.commentId),
      ),
    )
    .returning({ id: taggings.id });

  if (deleted.length === 0) {
    throw new AppError(404, "TAGGING_NOT_FOUND", "Tagging not found.");
  }

  await writeAudit(db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "comment.untagged",
    entityType: "comment",
    entityId: input.commentId,
    metadata: { tagId: input.tagId },
  });

  return { ok: true };
}

/** Tags attached to a set of comment IDs (for queue enrichment). */
export async function tagsForComments(
  db: Database,
  organizationId: string,
  commentIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (commentIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      commentId: taggings.entityId,
      id: tags.id,
      name: tags.name,
    })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(
      and(
        eq(taggings.organizationId, organizationId),
        eq(taggings.entityType, "comment"),
        inArray(taggings.entityId, commentIds),
      ),
    );

  for (const row of rows) {
    const list = map.get(row.commentId) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.commentId, list);
  }
  return map;
}

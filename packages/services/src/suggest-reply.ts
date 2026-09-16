import { brands, comments, posts } from "@social-ai/db";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { AppError } from "./errors";

export async function suggestCommentReply(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    commentId: string;
  },
): Promise<{ text: string; provider: string; model: string }> {
  const [comment] = await ctx.db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!comment) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }

  const [brand] = await ctx.db
    .select({ name: brands.name })
    .from(brands)
    .where(
      and(
        eq(brands.id, comment.brandId),
        eq(brands.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  const [post] = comment.postId
    ? await ctx.db
        .select({ body: posts.body })
        .from(posts)
        .where(
          and(
            eq(posts.id, comment.postId),
            eq(posts.organizationId, input.organizationId),
          ),
        )
        .limit(1)
    : [];

  let suggestion: { text: string };
  try {
    suggestion = await ctx.ai.suggestReply({
      organizationId: input.organizationId,
      commentText: comment.body,
      brandName: brand?.name,
      postText: post?.body ?? undefined,
      authorDisplayName: comment.authorDisplayName ?? undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI request failed";
    throw new AppError(502, "AI_PROVIDER_ERROR", message);
  }

  const text = suggestion.text.trim();
  if (!text) {
    throw new AppError(502, "AI_PROVIDER_ERROR", "Empty reply suggestion.");
  }

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "moderation.suggest_reply",
    entityType: "comment",
    entityId: comment.id,
    metadata: {
      provider: ctx.ai.provider,
      model: ctx.ai.model,
      textLength: text.length,
    },
  });

  return {
    text,
    provider: ctx.ai.provider,
    model: ctx.ai.model,
  };
}

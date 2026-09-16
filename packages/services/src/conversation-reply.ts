import { brands, conversations, messages, socialAccounts } from "@social-ai/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { getChannelAdapter } from "./adapters";
import { writeAudit } from "./audit";
import type { ServiceContext } from "./context";
import { decryptSecret } from "./crypto";
import { AppError } from "./errors";

function pageIdForMessaging(
  provider: string,
  externalAccountId: string,
  metadata: unknown,
): string {
  if (provider === "facebook" || provider === "meta") {
    return externalAccountId;
  }
  if (metadata && typeof metadata === "object") {
    const pageId = (metadata as { pageId?: unknown }).pageId;
    if (typeof pageId === "string" && pageId.length > 0) {
      return pageId;
    }
  }
  return externalAccountId;
}

export async function listConversationMessages(
  ctx: ServiceContext,
  input: { organizationId: string; conversationId: string },
) {
  const [conversation] = await ctx.db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new AppError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Conversation not found.",
    );
  }

  const rows = await ctx.db
    .select({
      id: messages.id,
      body: messages.body,
      direction: messages.direction,
      senderType: messages.senderType,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(200);

  await ctx.db
    .update(conversations)
    .set({ unread: false, updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));

  return rows;
}

export async function suggestConversationReply(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    conversationId: string;
  },
): Promise<{ text: string; provider: string; model: string }> {
  const [conversation] = await ctx.db
    .select({
      id: conversations.id,
      brandId: conversations.brandId,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new AppError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Conversation not found.",
    );
  }

  const [latest] = await ctx.db
    .select({ body: messages.body, direction: messages.direction })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!latest) {
    throw new AppError(400, "NO_MESSAGES", "Conversation has no messages.");
  }

  const [brand] = await ctx.db
    .select({ name: brands.name })
    .from(brands)
    .where(
      and(
        eq(brands.id, conversation.brandId),
        eq(brands.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  let suggestion: { text: string };
  try {
    suggestion = await ctx.ai.suggestReply({
      organizationId: input.organizationId,
      commentText: latest.body,
      brandName: brand?.name,
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
    eventType: "inbox.suggest_reply",
    entityType: "conversation",
    entityId: conversation.id,
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

export async function humanReplyToConversation(
  ctx: ServiceContext,
  input: {
    organizationId: string;
    actorId: string;
    conversationId: string;
    text: string;
  },
) {
  const text = input.text.trim();
  if (!text) {
    throw new AppError(400, "REPLY_TEXT_REQUIRED", "Reply text is required.");
  }
  if (text.length > 2000) {
    throw new AppError(
      400,
      "REPLY_TEXT_TOO_LONG",
      "Reply text must be 2000 characters or fewer.",
    );
  }

  const [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new AppError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Conversation not found.",
    );
  }

  const [account] = await ctx.db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, conversation.socialAccountId),
        eq(socialAccounts.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!account) {
    throw new AppError(
      404,
      "ACCOUNT_NOT_FOUND",
      "Social account not found for this conversation.",
    );
  }

  const adapter = getChannelAdapter(account.provider, ctx.meta);
  if (!adapter.capabilities().sendMessages) {
    throw new AppError(
      400,
      "MODERATION_ACTION_NOT_SUPPORTED",
      "This channel does not support sending messages.",
    );
  }

  const accessToken = decryptSecret(account.accessTokenEncrypted, ctx.tokenKey);
  const pageId = pageIdForMessaging(
    account.provider,
    account.externalAccountId,
    account.metadataJson,
  );
  const network = account.provider === "facebook" ? "facebook" : "instagram";

  const result = await adapter.sendMessage({
    organizationId: input.organizationId,
    accountId: pageId,
    recipientId: conversation.externalConversationId,
    body: text,
    accessToken,
    network,
  });

  await ctx.db.insert(messages).values({
    organizationId: input.organizationId,
    conversationId: conversation.id,
    externalMessageId: result.externalMessageId ?? `local-${Date.now()}`,
    direction: "outbound",
    senderType: "brand",
    senderExternalId: account.externalAccountId,
    body: text,
  });

  await ctx.db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      unread: false,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  await writeAudit(ctx.db, {
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    eventType: "inbox.message_sent",
    entityType: "conversation",
    entityId: conversation.id,
    metadata: {
      externalMessageId: result.externalMessageId,
      textLength: text.length,
    },
  });

  return { ok: true as const, externalMessageId: result.externalMessageId };
}

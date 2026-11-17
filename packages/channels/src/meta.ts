import { ChannelProviderError } from "./errors";
import {
  type MetaGraphConfig,
  fetchMetaComment,
  graphRequest,
  hideOrShowInstagramComment,
} from "./meta-graph";
import { normalizeMetaPayload, verifyMetaSignature } from "./meta-webhook";
import { UnsupportedChannelActionError } from "./types";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  DeleteCommentInput,
  HideCommentInput,
  NormalizedChannelEvent,
  NormalizedComment,
  PublishInput,
  SendMessageInput,
  UnhideCommentInput,
} from "./types";

const META_CAPABILITIES: ChannelCapabilities = {
  receiveComments: true,
  receiveMessages: true,
  hideComments: true,
  unhideComments: true,
  deleteComments: false,
  replyToComments: false,
  sendMessages: false,
  publishPosts: true,
};

export type MetaAdapterConfig = MetaGraphConfig & {
  appSecret: string;
  verifyToken: string;
};

function requireToken(input: { accessToken?: string }): string {
  if (!input.accessToken) {
    throw new ChannelProviderError(
      "unauthorized",
      "Missing page access token for Meta action.",
    );
  }
  return input.accessToken;
}

function networkOf(input: {
  network?: "instagram" | "facebook";
  accountId: string;
}): "instagram" | "facebook" {
  return input.network ?? "instagram";
}

export class MetaChannelAdapter implements ChannelAdapter {
  readonly provider = "meta";

  constructor(private readonly config: MetaAdapterConfig) {}

  capabilities(): ChannelCapabilities {
    return { ...META_CAPABILITIES };
  }

  async verifyWebhook(input: unknown): Promise<boolean> {
    if (!input || typeof input !== "object") {
      return false;
    }
    const body = input as {
      rawBody?: string;
      signature?: string;
      payload?: unknown;
    };
    if (typeof body.rawBody === "string") {
      return verifyMetaSignature(
        body.rawBody,
        body.signature,
        this.config.appSecret,
      );
    }
    return false;
  }

  async normalizeEvent(input: unknown): Promise<NormalizedChannelEvent[]> {
    if (input && typeof input === "object" && "payload" in input) {
      return normalizeMetaPayload((input as { payload: unknown }).payload);
    }
    return normalizeMetaPayload(input);
  }

  async sendMessage(_input: SendMessageInput): Promise<never> {
    throw new UnsupportedChannelActionError("sendMessage", this.provider);
  }

  async hideComment(input: HideCommentInput): Promise<{
    ok: true;
    externalActionId: string;
    externalCommentId: string;
  }> {
    const accessToken = requireToken(input);
    const network = networkOf(input);
    if (network === "facebook") {
      await graphRequest(this.config, {
        method: "POST",
        path: `/${input.externalCommentId}`,
        accessToken,
        query: { is_hidden: "true" },
        body: { is_hidden: "true" },
      });
      return {
        ok: true,
        externalActionId: `hide-${input.externalCommentId}`,
        externalCommentId: input.externalCommentId,
      };
    }
    const commentId = await hideOrShowInstagramComment(this.config, {
      accessToken,
      commentId: input.externalCommentId,
      hide: true,
      mediaId: input.externalPostId,
      igUserId: input.accountId,
      body: input.commentBody,
      author: input.authorDisplayName,
    });
    return {
      ok: true,
      externalActionId: `hide-${commentId}`,
      externalCommentId: commentId,
    };
  }

  async unhideComment(input: UnhideCommentInput): Promise<{
    ok: true;
    externalActionId: string;
    externalCommentId: string;
  }> {
    const accessToken = requireToken(input);
    const network = networkOf(input);
    if (network === "facebook") {
      await graphRequest(this.config, {
        method: "POST",
        path: `/${input.externalCommentId}`,
        accessToken,
        query: { is_hidden: "false" },
        body: { is_hidden: "false" },
      });
      return {
        ok: true,
        externalActionId: `unhide-${input.externalCommentId}`,
        externalCommentId: input.externalCommentId,
      };
    }
    const commentId = await hideOrShowInstagramComment(this.config, {
      accessToken,
      commentId: input.externalCommentId,
      hide: false,
      mediaId: input.externalPostId,
      igUserId: input.accountId,
      body: input.commentBody,
      author: input.authorDisplayName,
    });
    return {
      ok: true,
      externalActionId: `unhide-${commentId}`,
      externalCommentId: commentId,
    };
  }

  async deleteComment(_input: DeleteCommentInput): Promise<never> {
    throw new UnsupportedChannelActionError("deleteComment", this.provider);
  }

  async publish(input: PublishInput): Promise<{
    ok: boolean;
    externalPostId?: string;
    permalink?: string;
    needsMobile?: boolean;
  }> {
    const accessToken = requireToken(input);
    const network = networkOf(input);
    const body = input.body?.trim() ?? "";

    if (network === "facebook") {
      if (input.imageUrl) {
        const photo = await graphRequest<{ id?: string; post_id?: string }>(
          this.config,
          {
            method: "POST",
            path: `/${input.accountId}/photos`,
            accessToken,
            body: {
              url: input.imageUrl,
              caption: body,
              published: "true",
            },
          },
        );
        const externalPostId = photo.post_id ?? photo.id;
        return {
          ok: true,
          externalPostId,
          permalink: externalPostId
            ? `https://www.facebook.com/${externalPostId}`
            : undefined,
        };
      }

      const feed = await graphRequest<{ id?: string }>(this.config, {
        method: "POST",
        path: `/${input.accountId}/feed`,
        accessToken,
        body: { message: body },
      });
      return {
        ok: true,
        externalPostId: feed.id,
        permalink: feed.id ? `https://www.facebook.com/${feed.id}` : undefined,
      };
    }

    // Instagram Graph publishing requires a public image URL for feed posts.
    if (!input.imageUrl) {
      return { ok: false, needsMobile: true };
    }

    const creation = await graphRequest<{ id?: string }>(this.config, {
      method: "POST",
      path: `/${input.accountId}/media`,
      accessToken,
      body: {
        image_url: input.imageUrl,
        caption: body,
      },
    });
    if (!creation.id) {
      throw new ChannelProviderError(
        "unknown",
        "Instagram media creation returned no id.",
      );
    }

    const published = await graphRequest<{ id?: string }>(this.config, {
      method: "POST",
      path: `/${input.accountId}/media_publish`,
      accessToken,
      body: { creation_id: creation.id },
    });

    return {
      ok: true,
      externalPostId: published.id,
      permalink: published.id
        ? `https://www.instagram.com/p/${published.id}/`
        : undefined,
    };
  }

  async getComment(input: {
    accessToken: string;
    externalCommentId: string;
  }): Promise<NormalizedComment | null> {
    const comment = await fetchMetaComment(this.config, input);
    if (!comment) {
      return null;
    }
    return {
      externalCommentId: comment.id,
      externalPostId: comment.mediaId ?? "unknown",
      parentExternalCommentId: comment.parentId,
      authorExternalId: comment.fromId ?? "unknown",
      authorDisplayName: comment.fromName,
      body: comment.text ?? "",
    };
  }
}

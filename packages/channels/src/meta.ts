import { ChannelProviderError } from "./errors";
import {
  type MetaGraphConfig,
  fetchMetaComment,
  graphRequest,
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
  publishPosts: false,
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

  async hideComment(
    input: HideCommentInput,
  ): Promise<{ ok: true; externalActionId: string }> {
    const accessToken = requireToken(input);
    const network = networkOf(input);
    await graphRequest(this.config, {
      method: "POST",
      path: `/${input.externalCommentId}`,
      accessToken,
      query: network === "facebook" ? { is_hidden: "true" } : { hide: "true" },
    });
    return { ok: true, externalActionId: `hide-${input.externalCommentId}` };
  }

  async unhideComment(
    input: UnhideCommentInput,
  ): Promise<{ ok: true; externalActionId: string }> {
    const accessToken = requireToken(input);
    const network = networkOf(input);
    await graphRequest(this.config, {
      method: "POST",
      path: `/${input.externalCommentId}`,
      accessToken,
      query:
        network === "facebook" ? { is_hidden: "false" } : { hide: "false" },
    });
    return { ok: true, externalActionId: `unhide-${input.externalCommentId}` };
  }

  async deleteComment(_input: DeleteCommentInput): Promise<never> {
    throw new UnsupportedChannelActionError("deleteComment", this.provider);
  }

  async publish(_input: PublishInput): Promise<never> {
    throw new UnsupportedChannelActionError("publish", this.provider);
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

import { UnsupportedChannelActionError } from "./types";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  DeleteCommentInput,
  HideCommentInput,
  NormalizedChannelEvent,
  PublishInput,
  SendMessageInput,
  UnhideCommentInput,
} from "./types";

const MOCK_CAPABILITIES: ChannelCapabilities = {
  receiveComments: true,
  receiveMessages: true,
  hideComments: true,
  unhideComments: true,
  deleteComments: false,
  replyToComments: true,
  sendMessages: true,
  publishPosts: false,
};

type MockCommentEvent = {
  externalEventId: string;
  accountId: string;
  occurredAt?: string;
  comment: {
    externalCommentId: string;
    externalPostId: string;
    authorExternalId: string;
    authorDisplayName?: string;
    body: string;
    parentExternalCommentId?: string;
  };
  post?: { body?: string; permalink?: string };
};

export class MockChannelAdapter implements ChannelAdapter {
  readonly provider = "mock";
  readonly hiddenCommentIds = new Set<string>();

  capabilities(): ChannelCapabilities {
    return { ...MOCK_CAPABILITIES };
  }

  async verifyWebhook(input: unknown): Promise<boolean> {
    return Boolean(input && typeof input === "object");
  }

  async normalizeEvent(input: unknown): Promise<NormalizedChannelEvent[]> {
    if (!input || typeof input !== "object" || !("comment" in input)) {
      return [];
    }

    const event = input as MockCommentEvent;
    return [
      {
        provider: this.provider,
        accountId: event.accountId,
        externalEventId: event.externalEventId,
        type: "comment.received",
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        post: event.post
          ? {
              externalPostId: event.comment.externalPostId,
              body: event.post.body,
              permalink: event.post.permalink,
            }
          : {
              externalPostId: event.comment.externalPostId,
            },
        comment: event.comment,
      },
    ];
  }

  async sendMessage(
    input: SendMessageInput,
  ): Promise<{ ok: true; externalMessageId: string }> {
    return { ok: true, externalMessageId: `mock-msg-${input.recipientId}` };
  }

  async hideComment(
    input: HideCommentInput,
  ): Promise<{ ok: true; externalActionId: string }> {
    this.hiddenCommentIds.add(input.externalCommentId);
    return { ok: true, externalActionId: `hide-${input.externalCommentId}` };
  }

  async unhideComment(
    input: UnhideCommentInput,
  ): Promise<{ ok: true; externalActionId: string }> {
    this.hiddenCommentIds.delete(input.externalCommentId);
    return { ok: true, externalActionId: `unhide-${input.externalCommentId}` };
  }

  async deleteComment(_input: DeleteCommentInput): Promise<never> {
    throw new UnsupportedChannelActionError("deleteComment", this.provider);
  }

  async publish(_input: PublishInput): Promise<never> {
    throw new UnsupportedChannelActionError("publish", this.provider);
  }
}

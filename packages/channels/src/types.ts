export type ChannelCapabilities = {
  receiveComments: boolean;
  receiveMessages: boolean;
  hideComments: boolean;
  unhideComments: boolean;
  deleteComments: boolean;
  replyToComments: boolean;
  sendMessages: boolean;
  publishPosts: boolean;
};

export type NormalizedPost = {
  externalPostId: string;
  body?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaType?: string;
};

export type NormalizedComment = {
  externalCommentId: string;
  externalPostId: string;
  parentExternalCommentId?: string;
  authorExternalId: string;
  authorDisplayName?: string;
  body: string;
};

export type NormalizedConversation = {
  externalConversationId: string;
  contactExternalId: string;
};

export type NormalizedMessage = {
  externalMessageId: string;
  body: string;
  direction: "inbound" | "outbound";
};

export type NormalizedChannelEvent = {
  provider: string;
  accountId: string;
  externalEventId: string;
  type:
    | "message.received"
    | "comment.received"
    | "comment.updated"
    | "message.sent"
    | "account.updated";
  occurredAt: string;
  conversation?: NormalizedConversation;
  message?: NormalizedMessage;
  post?: NormalizedPost;
  comment?: NormalizedComment;
};

export type HideCommentInput = {
  organizationId: string;
  externalCommentId: string;
  accountId: string;
  /** Injected by the outbound worker after decrypt. Never sent to the browser. */
  accessToken?: string;
  network?: "instagram" | "facebook";
};

export type HideCommentResult = {
  ok: boolean;
  externalActionId?: string;
};

export type UnhideCommentInput = HideCommentInput;
export type UnhideCommentResult = HideCommentResult;
export type DeleteCommentInput = HideCommentInput;
export type DeleteCommentResult = HideCommentResult;

export type SendMessageInput = {
  organizationId: string;
  accountId: string;
  recipientId: string;
  body: string;
  accessToken?: string;
  network?: "instagram" | "facebook";
};

export type SendMessageResult = {
  ok: boolean;
  externalMessageId?: string;
};

export type PublishInput = {
  organizationId: string;
  accountId: string;
  body: string;
};

export type PublishResult = {
  ok: boolean;
  externalPostId?: string;
};

export class UnsupportedChannelActionError extends Error {
  readonly code = "MODERATION_ACTION_NOT_SUPPORTED";

  constructor(action: string, provider: string) {
    super(`Channel ${provider} does not support ${action}.`);
    this.name = "UnsupportedChannelActionError";
  }
}

export type WebhookVerifyInput = {
  payload?: unknown;
  rawBody?: string;
  signature?: string;
  query?: Record<string, string | string[] | undefined>;
};

export interface ChannelAdapter {
  readonly provider: string;
  capabilities(): ChannelCapabilities;
  verifyWebhook(input: unknown): Promise<boolean>;
  normalizeEvent(input: unknown): Promise<NormalizedChannelEvent[]>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  hideComment(input: HideCommentInput): Promise<HideCommentResult>;
  unhideComment(input: UnhideCommentInput): Promise<UnhideCommentResult>;
  deleteComment(input: DeleteCommentInput): Promise<DeleteCommentResult>;
  publish(input: PublishInput): Promise<PublishResult>;
  getComment?(input: {
    accessToken: string;
    externalCommentId: string;
  }): Promise<NormalizedComment | null>;
}

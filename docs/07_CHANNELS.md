# Social Channel Integration Strategy

## Principle

Social networks are external systems.

Every provider is isolated behind an adapter.

The domain model must never depend on provider-specific payloads.

This file is the source of truth for `ChannelAdapter`.

## Priority

V1:

1. Meta / Instagram
2. Meta / Facebook

Later:

3. WhatsApp Business
4. TikTok
5. YouTube
6. LinkedIn
7. X

Actual API capabilities and permissions must be verified during implementation. Meta App Review is on the critical path; do not assume hide/delete is available until the adapter reports it.

## Adapter responsibilities

- OAuth
- webhook verification
- webhook parsing
- event normalization
- outbound messages (Phase 4 for AI replies; humans may reply in V1 if the adapter supports it)
- comment hide / unhide / delete
- comment retrieval
- publishing (Phase 7)
- media
- rate limits
- error mapping

## Interface

```ts
interface ChannelAdapter {
  readonly provider: string;
  capabilities(): ChannelCapabilities;
  verifyWebhook(input: unknown): Promise<boolean>;
  normalizeEvent(input: unknown): Promise<NormalizedChannelEvent[]>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  hideComment(input: HideCommentInput): Promise<HideCommentResult>;
  unhideComment(input: UnhideCommentInput): Promise<UnhideCommentResult>;
  deleteComment(input: DeleteCommentInput): Promise<DeleteCommentResult>;
  publish(input: PublishInput): Promise<PublishResult>;
}
```

```ts
type HideCommentInput = {
  organizationId: string;
  externalCommentId: string;
  accountId: string;
  accessToken?: string; // injected by outbound worker; never from the UI
  network?: "instagram" | "facebook";
};
```

Not every provider supports every operation. Implementations may throw a typed `UnsupportedChannelActionError` when a capability is false.

V1 workers must not call `publish`. Keep the method so Phase 7 does not break the interface.

## Capabilities

```ts
type ChannelCapabilities = {
  receiveComments: boolean;
  receiveMessages: boolean;
  hideComments: boolean;
  unhideComments: boolean;
  deleteComments: boolean;
  replyToComments: boolean;
  sendMessages: boolean;
  publishPosts: boolean;
};
```

The application must check capabilities before attempting an action. If `hideComments` is false, flag for review and do not pretend the comment was hidden.

## Normalized event

```ts
type NormalizedChannelEvent = {
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
```

## OAuth

OAuth starts at `POST /api/v1/channels/:provider/connect`. The API returns an authorization URL; tokens never appear in JSON. Workers inject the decrypted page token into adapter hide/unhide calls.

Validate: state HMAC, redirect URI, scopes, token expiration.

## Webhooks

Every endpoint:

1. verifies signature;
2. validates payload;
3. identifies tenant/account;
4. persists raw inbound event;
5. responds quickly;
6. queues processing.

## Moderation action

Hide/unhide/delete are asynchronous and go through the outbound action bus.

```text
Moderation decision or human action
      ↓
Policy / permission / capability check
      ↓
Queue outbound-actions
      ↓
Channel adapter
      ↓
Provider
      ↓
Action result
      ↓
Audit
```

## Rate limits

Outbound actions must support: rate limiting, retry, exponential backoff, dead-letter handling.

## Provider failures

Normalize: `unauthorized` | `forbidden` | `not_found` | `rate_limited` | `validation_error` | `unsupported` | `transient` | `unknown`.

Never leak raw provider internals unnecessarily.

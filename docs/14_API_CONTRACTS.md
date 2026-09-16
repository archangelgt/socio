# API Contracts

Use REST and OpenAPI. All routes below are V1 unless marked later.

Tenant context comes from the session plus `X-Organization-Id` (or the user's only membership). Every handler enforces membership.

Errors:

```json
{
  "error": {
    "code": "MODERATION_ACTION_NOT_SUPPORTED",
    "message": "This channel does not support hiding comments."
  }
}
```

Never expose stack traces or secrets. Paginate list endpoints with `limit` (max 100) and `cursor`.

## Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/invitations/:token/accept
```

## Organizations and members

```text
GET    /api/v1/organizations
POST   /api/v1/organizations
GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id
GET    /api/v1/organizations/:id/members
POST   /api/v1/organizations/:id/invitations
DELETE /api/v1/organizations/:id/members/:userId
```

## Brands

```text
GET   /api/v1/brands
POST  /api/v1/brands
GET   /api/v1/brands/:id
PATCH /api/v1/brands/:id
```

## Channels

```text
GET    /api/v1/channels
POST   /api/v1/channels/:provider/connect
GET    /api/v1/channels/oauth/:provider/callback
GET    /api/v1/channels/:id
DELETE /api/v1/channels/:id
```

`connect` starts OAuth. Tokens never appear in JSON responses.

## Inbox

```text
GET   /api/v1/conversations
GET   /api/v1/conversations/:id
PATCH /api/v1/conversations/:id
POST  /api/v1/conversations/:id/assign
POST  /api/v1/conversations/:id/close
GET   /api/v1/conversations/:id/messages
POST  /api/v1/conversations/:id/messages

GET   /api/v1/comments
POST  /api/v1/comments/sync
POST  /api/v1/comments/:id/reply
POST  /api/v1/comments/:id/suggest-reply
GET   /api/v1/comments/:id
GET   /api/v1/posts/:id
GET   /api/v1/posts/:id/preview
```

Query filters for inbox lists (`GET /api/v1/comments`, `GET /api/v1/conversations`, `GET /api/v1/moderation/queue`):

- `socialAccountId` (uuid, optional) — scope to one connected social account
- `brandId` (uuid, optional) — scope to one brand
- `status` (comments + moderation queue) — queue state (`REVIEW_REQUIRED`, …) or bucket (`review`, `hidden`, `allowed`, `failed`)
- `severity` (comments + moderation queue) — `NONE` | `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
- `q` — search body/author/contact/account/brand
- `sort` (comments + moderation queue) — `createdAt` | `severity` | `confidence` | `status` | `author`
- `order` — `asc` | `desc` (default `desc`, newest first)
- `page`, `pageSize` — 1-based pagination (`pageSize` max 100, default 25)

`GET /api/v1/comments` and `GET /api/v1/conversations` return `{ items-key, page, pageSize, total, totalPages }`.
`GET /api/v1/moderation/queue` returns `{ items, page, pageSize, total, totalPages }`.

List items include `socialAccountId`, `accountDisplayName`, `provider`, `brandId`, and `brandName`.

Filtering by `socialAccountId` includes Meta Page + linked Instagram siblings that share the same `metadata.pageId` (so CADI Facebook and `@cadi.gt` are one area).

`GET /api/v1/conversations/:id/messages` lists thread messages (marks unread false).
`POST /api/v1/conversations/:id/messages` body `{ "text" }` sends a DM via the channel adapter.
`POST /api/v1/conversations/:id/suggest-reply` returns a draft suggestion (never sends).

`PATCH /api/v1/channels/:id/auto-reply` body: `{ "enabled": boolean, "siblingIds"?: uuid[] }`. Persists `autoReplyEnabled` on the account (and optional Meta Page/IG siblings). When enabled, allowed comments on that account get an AI public reply after moderation or human allow (ADR-026); review/hide/fail paths skip auto-reply.

`POST /api/v1/comments/:id/reply` body: `{ "text": string }` (1–2000 chars). Human reply only; queues outbound `reply` via the channel adapter. Not an AI suggested-reply endpoint.

`POST /api/v1/comments/:id/suggest-reply` returns `{ suggestion: { text, provider, model } }`. Draft only — never posts until the human sends `/reply`.

## Tags

```text
GET   /api/v1/tags
POST  /api/v1/tags
POST  /api/v1/comments/:id/tags
DELETE /api/v1/comments/:id/tags/:tagId
POST  /api/v1/conversations/:id/tags
DELETE /api/v1/conversations/:id/tags/:tagId
```

## Moderation

```text
GET  /api/v1/moderation/queue
GET  /api/v1/moderation/decisions/:id
POST /api/v1/moderation/decisions/:id/allow
POST /api/v1/moderation/decisions/:id/hide
POST /api/v1/moderation/decisions/:id/delete
POST /api/v1/moderation/decisions/:id/restore
POST /api/v1/moderation/decisions/:id/override
```

Handlers must verify tenant, permission, decision state, and channel capability.

## Moderation policies

```text
GET   /api/v1/moderation/policies
POST  /api/v1/moderation/policies
GET   /api/v1/moderation/policies/:id
PATCH /api/v1/moderation/policies/:id
GET   /api/v1/moderation/policies/:id/rules
PUT   /api/v1/moderation/policies/:id/rules
```

## Metrics (thin V1)

```text
GET /api/v1/moderation/metrics
```

Counts: analyzed, allowed, auto-hidden, review required, action failures, false positives, by category. Not the Phase 8 analytics product.

## Webhooks

Provider webhooks are not authenticated through user sessions. They require provider signature verification.

```text
POST /api/v1/webhooks/:provider
POST /api/v1/webhooks/:provider/:accountId
```

Prefer identifying the account from the payload after signature check. `:accountId` is allowed when the provider cannot route otherwise.

## Not in V1 HTTP API

- `POST /api/v1/ai/moderate` — workers call `packages/ai` directly. Do not expose a generic LLM proxy.
- `/api/v1/agents`
- `/api/v1/knowledge`
- `/api/v1/automations`
- `/api/v1/analytics` (beyond thin moderation metrics)

Phase 4 may deepen reply assistance (tone, Brand Brain context, usage metering). V1 already has draft-only `POST /api/v1/comments/:id/suggest-reply` (ADR-025).

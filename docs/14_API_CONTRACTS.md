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
POST /api/v1/auth/forgot-password
GET  /api/v1/auth/password-token/:token
POST /api/v1/auth/set-password
GET  /api/v1/auth/invitations/:token
POST /api/v1/auth/invitations/:token/accept
```

`forgot-password` always returns `{ accepted: true }` (no email enumeration).
`set-password` consumes a one-time `auth_tokens` link (`password_reset` or
`welcome_set_password`) and opens a session cookie. Register also best-effort
sends a welcome set-password email when Zoho is configured.

## Organizations and members

```text
GET    /api/v1/organizations
GET    /api/v1/members
POST   /api/v1/members
POST   /api/v1/members/welcome
PATCH  /api/v1/members/:membershipId
DELETE /api/v1/members/:membershipId
```

Members routes use the active org (`X-Organization-Id`) and require ADMIN+.
`POST /members` adds an existing user by email (optional `clientIds` for scopes).
`POST /members/welcome` ensures membership (creates user if missing) and emails
a set-password welcome link.
`PATCH` updates role. Empty `clientIds` on scope replace means org-wide access.

## Clients

```text
GET   /api/v1/clients
POST  /api/v1/clients
POST  /api/v1/memberships/:membershipId/scopes
PUT   /api/v1/memberships/:membershipId/scopes
```

List/create clients for the active organization. Responses respect `membership_scopes`
(OWNER/ADMIN with no scopes see all clients). `PUT .../scopes` replaces the full
client grant list (`clientIds: []` = org-wide). Optional query `clientId` on
brand/channel/inbox list routes further narrows results; server still enforces scopes.

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
GET   /api/v1/comments/:id
GET   /api/v1/posts/:id
GET   /api/v1/posts/:id/preview
```

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
POST /api/v1/moderation/eval
POST /api/v1/comments/sync-ads
POST /api/v1/comments/:id/assign
POST /api/v1/comments/:id/case
GET  /api/v1/assignees
```

Counts: analyzed, allowed, auto-hidden, review required, action failures, false positives, by category. Eval is labeled dry-run FP/FN (no outbound). Not the Phase 8 analytics product.

## Webhooks

Provider webhooks are not authenticated through user sessions. They require provider signature verification.

```text
POST /api/v1/webhooks/:provider
POST /api/v1/webhooks/:provider/:accountId
```

Prefer identifying the account from the payload after signature check. `:accountId` is allowed when the provider cannot route otherwise.

## Piloto (ADR-026) — knowledge, incidents, simulation

Client-scoped Brand Brain light, crisis workflow, and dry-run policy compare:

```text
GET    /api/v1/knowledge?clientId=
POST   /api/v1/knowledge
PATCH  /api/v1/knowledge/:id
GET    /api/v1/incidents?clientId=
POST   /api/v1/incidents
PATCH  /api/v1/incidents/:id
POST   /api/v1/incidents/:id/evidence
GET    /api/v1/incidents/:id/dossier
PATCH  /api/v1/clients/:id/crisis
POST   /api/v1/moderation/simulate
```

Crisis mode pauses auto-hide while AI still classifies into the human queue.

## Not in V1 HTTP API

- `POST /api/v1/ai/moderate` — workers call `packages/ai` directly. Do not expose a generic LLM proxy.
- `/api/v1/agents`
- `/api/v1/automations`
- `/api/v1/analytics` (beyond thin moderation metrics)
Phase 4 may add `POST /api/v1/comments/:id/suggested-reply` as an application operation (tenant + RBAC + usage), never as a raw provider proxy.

### Moderation queue origin filter (RF-14)

```text
GET /api/v1/moderation/queue?origin=organic|ad|boosted|paid
```

`paid` = `ad` + `boosted`. Mock webhooks may set comment `origin` / ad refs; live Meta Ad Account sync is ADR-027.

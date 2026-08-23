# Architecture Decision Log

This is the canonical ADR file. Read it before choosing libraries.

## ADR-001 — Multi-tenant from day one

Decision: all tenant-owned entities carry organization context.

Reason: retrofitting tenancy later is dangerous and expensive.

## ADR-002 — Provider adapters

Decision: all social networks use channel adapters. Canonical interface: `07_CHANNELS.md`.

Reason: avoid provider lock-in and keep domain logic portable.

## ADR-003 — AI provider abstraction

Decision: AI access uses a provider interface in `packages/ai`.

Reason: models change rapidly. The product must not depend on one vendor.

## ADR-004 — Async moderation

Decision: moderation is asynchronous after webhook ingestion.

Reason: webhooks must respond quickly and AI/provider latency must not block ingestion.

## ADR-005 — Policy engine between AI and actions

Decision:

```text
AI → Policy → Permission → Outbound action bus → Adapter
```

Reason: the model cannot be trusted as an authorization layer.

## ADR-006 — Human review default

Decision: automatic destructive moderation is opt-in and configurable.

Reason: false positives can damage legitimate community discussion.

## ADR-007 — Hide before delete

Decision: for supported channels, hiding is the preferred automatic moderation action.

Reason: it is generally more reversible and less destructive than deletion.

## ADR-008 — PostgreSQL + pgvector later

Decision: PostgreSQL for application data. Add pgvector when Phase 3 (Brand Brain) starts.

Reason: reduces infrastructure complexity. V1 does not need RAG.

## ADR-009 — Audit every AI action

Decision: every moderation decision and external AI action is auditable.

Reason: users need to understand and reverse automation.

## ADR-010 — No CRM core

Decision: the product is not designed as a CRM.

Reason: differentiation is social operations, moderation, AI, and automation.

## ADR-011 — pnpm workspaces + Turborepo

Decision: Node 22 preferred (20+ supported), pnpm, Turborepo.

Reason: matches the documented app/package layout and keeps task graphs explicit for agents.

## ADR-012 — Fastify 5 for the HTTP API

Decision: `apps/api` is Fastify. OpenAPI via `@fastify/swagger`.

Reason: typed, explicit plugins, no NestJS module magic, easy to keep domain packages framework-free.

## ADR-013 — Vite + React for the web app

Decision: `apps/web` is Vite, React, React Router, TanStack Query.

Reason: the API is a separate app. Next.js would add a second server without benefit in V1.

## ADR-014 — Drizzle ORM

Decision: Drizzle + `postgres` (postgres.js) + drizzle-kit migrations.

Reason: SQL stays visible (important for `organization_id` on every query) and pgvector is straightforward in Phase 3.

## ADR-015 — BullMQ on Redis

Decision: all background work uses BullMQ.

V1 queues:

- `inbound-events`
- `moderation`
- `outbound-actions`

Later: embeddings, automation, analytics.

Reason: one queue system, retries, backoff, and dead-letter handling.

## ADR-016 — Zod for runtime validation

Decision: Zod schemas at HTTP and AI-output boundaries. Domain types live in `packages/domain` and are inferred from or kept in sync with Zod.

Reason: AI output and webhooks are untrusted. OpenAPI can be generated from the same shapes later; do not hand-write a parallel type system.

## ADR-017 — Cookie sessions, not bearer JWTs in the browser

Decision:

- httpOnly, Secure, SameSite=Lax session cookie
- session rows in PostgreSQL (hash at rest)
- Argon2id for passwords
- invite-only membership after the first owner signup

Reason: tokens in localStorage are the wrong default for a dashboard. OIDC/SSO is Phase 10.

## ADR-018 — MinIO locally, S3 API

Decision: Docker Compose runs MinIO. Application uses an S3-compatible client.

Reason: Brand Brain (Phase 3) needs object storage. Do not couple to one cloud vendor.

## ADR-019 — Canonical moderation taxonomy

Decision: enums and queue states are defined once in `packages/moderation` and `12_AI_MODERATION.md`. Product/agent docs reference them; they do not fork lists.

Low confidence maps to `REVIEW_REQUIRED`, not a separate `escalate` status. `ESCALATE` remains an action a human or later automation may take.

## ADR-020 — Single outbound action bus

Decision: hide, unhide, and delete are executed only by the outbound-actions worker via `ChannelAdapter`.

Sources (`policy`, `human`, `automation`) insert into the same `moderation_actions` (V1) / outbound jobs table. Automation (Phase 5) must not call adapters.

Reason: prevents double-hide, duplicated retries, and split audit trails.

## ADR-021 — One active social account per provider id

Decision: unique `(provider, external_account_id)` among rows with `status = 'active'`.

Reason: Meta tokens and webhook routing cannot safely fan out the same Page to two organizations. Agencies use brands inside one org or multiple memberships, not duplicate connections.

## ADR-022 — Vitest + Biome

Decision: Vitest for unit/integration tests. Biome for lint and format.

Reason: fast, one toolchain, easy for agents to run.

## ADR-023 — Mock providers in local/dev/test

Decision: `packages/channels` and `packages/ai` ship a mock adapter/provider. Real Meta/LLM calls are opt-in via env.

Reason: tests never hit production APIs. Demos work without credentials.

## ADR-024 — Meta Graph as the first real channel

Decision: Instagram and Facebook share `MetaChannelAdapter` (`provider` on stored accounts is `instagram` or `facebook`). OAuth and webhooks use the `meta` route. Graph calls are opt-in via `META_APP_*` env vars. Hide/unhide inject the decrypted page token into the adapter; the adapter never reads the database.

Reason: one Meta app, one webhook URL, ADR-021 uniqueness still applies per IG user id / Page id.


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

## ADR-025 — Client between Organization and Brand

Decision: tenancy hierarchy is Organization → Client → Brand → SocialAccount. `brands.client_id` is required (backfill one `default` client per org). `organization_id` remains denormalized on brands. Optional `membership_scopes` restrict a membership to client(s); OWNER/ADMIN with no scopes retain org-wide access. List APIs enforce scopes server-side.

Reason: agencies need folders per client without reinterpreting Brand as the client, and piloto isolation requires grants in the same slice as the Client entity.

## ADR-026 — AndyMorales piloto expands Frozen V1

Decision: for the AndyMorales Studio pilot, Socio may ship calendar pieces, guest month share links, invitations, urgency (semáforo), Meta publish for approved pieces, client KB (documents light), incidents + crisis mode, policy simulation, and a unified moderation bandeja that tags comment `origin` (`organic` | `ad` | `boosted`) beyond the Frozen V1 wedge. Moderation Meta path remains the reliability baseline.

Reason: product direction is AndyMorales on Socio (not a fork); the requirements MD is the pilot acceptance source.

## ADR-028 — Zoho CPaaS for transactional auth email

Decision: optional Zoho CPaaS Email API (`ZOHO_CPAAS_API_KEY` + `ZOHO_EMAIL_FROM`) sends workspace invites, register welcome + set-password, forgot-password, and admin `POST /api/v1/members/welcome` provision mail. One-time tokens live in `auth_tokens` (`password_reset` | `welcome_set_password`), hashed, 48h TTL. If Zoho is unset or send fails, tokens/invites still exist and UI can copy links where applicable. Never call Zoho from the browser. DKIM/SPF for CPaaS must be completed in Zoho Domains so Outlook does not show “sender couldn’t be verified”.

Reason: piloto Team invites and Andy onboarding need email delivery without standing up SMTP; Seraph already uses Zoho CPaaS.

## ADR-027 — Meta Ads comments (RF-14) path

Decision: store paid/promoted provenance on `comments` (`origin`, `ad_external_id`, `creative_external_id`, `campaign_external_id`) and filter the existing moderation queue rather than a separate ads product. Live Meta pull uses Marketing API creative → `effective_instagram_media_id` → IG `/comments` (non-organic); hide/unhide reuse Instagram comment moderation. Permissions: `instagram_manage_comments` plus `ads_read` or `ads_management` when Page role is via Business Manager. OAuth scope list includes `ads_read`. `POST /api/v1/comments/sync-ads` accepts `adAccountId` and/or explicit creative/media IDs. Mock webhooks may set `origin=ad` for piloto acceptance without Marketing API tokens. Full Advantage+ catalog ads remain out of scope until Meta app review grants ads scopes.

Reason: RF-14 wants one bandeja with organic + pauta; Meta docs separate organic vs non-organic media IDs, so provenance columns + queue filter are the minimal contract.

## ADR-029 — Cases, tags, assign, and ES eval (piloto close-out)

Decision: expose schema already present for comment `case_kind` / `attention_due_at` / `assigned_user_id` and org `tags`/`taggings` via API + Moderation UI. Thin `GET /api/v1/moderation/metrics` counts analyzed/auto-hidden/review/FP(overridden). Labeled dry-run eval is `POST /api/v1/moderation/eval` with optional default Spanish GT/CA fixtures (RF-21) — no outbound. TikTok/YouTube/X stay out of piloto.

Reason: AndyMorales piloto acceptance needs assign/tags/casos and measurable Spanish moderation without opening new channel adapters.


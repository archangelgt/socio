# Product Roadmap

V1 = Phase 0 + Phase 1 + Phase 2. Do not start later phases until V1 is demoable with a real or sandbox Meta comment hide.

## Phase 0 — Foundation

- repository
- Docker
- PostgreSQL
- Redis
- migrations
- authentication (sessions + invitations)
- RBAC
- organizations
- brands
- audit
- CI
- testing

## Phase 1 — Unified Social Inbox

- channel abstraction (`07_CHANNELS.md`)
- Meta Instagram + Facebook
- webhooks and inbound event store
- posts, conversations, messages, comments
- attachments as JSON metadata in V1
- assignment
- tags
- search
- unread/read

## Phase 2 — AI Moderation (core V1)

- AI gateway
- provider abstraction
- canonical moderation schema
- severity and confidence
- moderation policies and rules
- automatic hide
- outbound action queue (single bus)
- moderation queue UI
- audit trail
- undo/restore where supported
- thin moderation metrics

This is a core MVP phase.

## Phase 3 — Brand Brain

- knowledge sources
- document ingestion
- URL ingestion
- embeddings (pgvector)
- retrieval
- FAQs
- tone
- AI testing playground

## Phase 4 — AI Assistant

- classifications
- sentiment
- intent
- reply suggestions
- translation
- rewrite tools
- AI action audit

## Phase 5 — Automation

- triggers, conditions, actions
- execution engine
- idempotency and loop prevention
- approvals
- escalation

Automation must enqueue the same outbound action bus as moderation. It must never call a channel adapter directly.

## Phase 6 — More Channels

- WhatsApp
- TikTok
- YouTube
- LinkedIn
- X

Add channels only when adapter contracts remain clean.

## Phase 7 — Publisher

- content composer
- AI generation
- calendar
- scheduling
- approval
- multi-channel publishing

## Phase 8 — Analytics

- comment volume
- moderation volume
- auto-hide rate
- false-positive rate
- response time
- sentiment
- intent
- AI resolution
- human takeover
- automation success
- agent performance
- AI cost

## Phase 9 — AI Workforce

Specialized agents: Moderator, Support, Community, Publisher, Engagement.

Each gets explicit tools and permissions.

## Phase 10 — Commercialization

- plans
- usage metering
- limits
- billing
- agency workspaces
- enterprise controls

## Do not build early

Avoid:

- full CRM
- full help desk
- mobile apps
- dozens of channels
- custom LLM training
- complex marketplace
- visual automation builder
- Brand Brain before a real Meta hide works

The initial wedge is:

> AI-powered social moderation + unified social conversations.

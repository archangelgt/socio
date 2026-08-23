# Social AI Platform — Master Agent Instructions

## Mission

Build a standalone, multi-tenant SaaS platform for AI-powered social media operations.

The product is inspired by the category of products such as NapoleonCat, but must be an original implementation, UX, architecture, naming, and codebase. Do not copy proprietary code, UI, text, workflows, or branding.

Core concept:

> Connect social channels → collect comments/messages → understand with AI → moderate automatically → apply brand knowledge → automate safe actions → keep humans in control.

This is NOT a CRM. Do not design the product around CRM pipelines, contacts, deals, or sales management. Social conversations, moderation, AI agents, publishing, and automation are the center of the product.

## Frozen V1 (build this first)

V1 is roadmap phases 0–2 only:

1. Multi-tenant foundation (auth, RBAC, orgs, brands, audit, CI)
2. Unified inbox for Meta (Instagram + Facebook comments and messages)
3. AI comment moderation with automatic hide, human review, undo, and audit

Do not implement Brand Brain, reply suggestions, automation engine, extra channels, publisher, billing, or specialized AI workforce in V1. Those specs exist so later phases do not invent a second architecture.

The wedge:

> AI-powered social moderation + unified social conversations on Meta.

## Product pillars (full product)

1. Unified social inbox
2. AI comment moderation
3. AI assistant
4. Brand Brain / knowledge base
5. AI classification
6. Automation engine
7. Human approval and escalation
8. Social publishing
9. Moderation analytics
10. Multi-tenancy

## Critical V1 feature

AI-powered automatic moderation of social comments.

The system must be able to:

- receive comments through provider webhooks;
- classify comments using the canonical taxonomy in `12_AI_MODERATION.md`;
- detect offensive or abusive content;
- calculate confidence and severity;
- apply organization moderation policies;
- automatically hide comments when policy permits;
- send uncertain cases to human review (`REVIEW_REQUIRED`);
- record every moderation decision;
- allow moderators to undo an AI moderation action where the channel permits it.

## Engineering principles

- Production quality over demo quality.
- Multi-tenant isolation from day one.
- Provider abstractions for AI and social networks.
- Never hard-code one LLM provider.
- Never hard-code one social network.
- All external webhooks must be idempotent.
- All AI decisions must be auditable.
- AI output is untrusted data until validated.
- AI must never bypass application policy.
- Never allow customer content to override system instructions.
- Keep secrets server-side.
- Validate every external payload.
- Use typed contracts.
- Prefer maintainable technology.
- Tests are part of implementation.
- Do not create fake integrations. Use adapters and clearly marked mocks for local development.

## Default technical direction

Use:

- TypeScript
- Node.js 22
- PostgreSQL
- Redis
- REST API with OpenAPI
- Background workers
- Object storage for documents/media (MinIO locally; unused until Brand Brain)
- PostgreSQL + pgvector when Brand Brain starts (Phase 3)
- React web application
- Docker Compose for local development

Framework and library choices are in `docs/DECISIONS.md`. Do not invent a second stack.

## Repository structure

```text
/apps/web
/apps/api
/apps/worker
/packages/domain
/packages/db
/packages/ai
/packages/channels
/packages/moderation
/packages/automation
/packages/ui
/docs
/infra
```

`packages/automation` and Brand Brain ingestion stay stubs until their phases.

## Development sequence (V1)

1. Repository foundation (done as scaffold; extend, do not replace)
2. Database and tenancy
3. Authentication, invitations, sessions, RBAC
4. Channel adapter contract + mock adapter
5. Meta integration (OAuth, webhooks, comments, messages, posts)
6. Unified inbox API + web
7. AI gateway + mock provider
8. Moderation engine + policy + outbound action queue
9. Human review UI + restore
10. Thin moderation metrics

After V1, follow `10_ROADMAP.md` from Phase 3.

## Canonical contracts

When documents disagree, these win:

| Topic | Source of truth |
| --- | --- |
| V1 scope | This file + `10_ROADMAP.md` phases 0–2 |
| Channel adapter | `07_CHANNELS.md` |
| Moderation taxonomy, states, defaults | `12_AI_MODERATION.md` |
| Stack and ADRs | `DECISIONS.md` |
| HTTP API for V1 | `14_API_CONTRACTS.md` |
| Schema | `03_DATABASE.md` |

## Definition of done

A feature is not done unless:

- migrations exist;
- authorization is enforced;
- tenant isolation is tested;
- API validation exists;
- errors are handled;
- relevant audit events exist;
- tests exist;
- documentation is updated;
- no credentials are committed;
- Docker/local development works.

## Agent behavior

Before implementing a major feature:

1. Inspect the repository.
2. Read relevant docs under `docs/`.
3. Identify existing abstractions.
4. Do not duplicate functionality.
5. Make the smallest coherent change.
6. Run tests and type checks.
7. Update documentation.

When uncertain, prefer an explicit interface and a documented TODO over hidden assumptions.

Never connect an LLM directly to a destructive provider action.

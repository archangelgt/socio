# Agent instructions

This repository is a multi-tenant SaaS for AI social moderation. Specs live in `docs/`.

Before any feature work:

1. Read `docs/00_MASTER.md`
2. Read `docs/DECISIONS.md`
3. Read the spec for the area you are changing
4. Inspect existing packages; do not duplicate abstractions

## Frozen V1

Phases 0–2 only: foundation, Meta inbox (comments + messages), AI comment moderation with hide / human review / audit.

Do not implement Brand Brain, reply suggestions, automation engine, publisher, billing, or extra channels.

## Canonical contracts

- Channel adapter: `docs/07_CHANNELS.md` + `packages/channels`
- Moderation taxonomy and policy: `docs/12_AI_MODERATION.md` + `packages/moderation`
- HTTP API: `docs/14_API_CONTRACTS.md`
- Schema: `docs/03_DATABASE.md` + `packages/db`

When documents disagree, `docs/00_MASTER.md` lists the winner.

## Commands

```bash
pnpm docker:up
pnpm install
pnpm check
pnpm dev
```

Never commit secrets. Never call a provider API from the web app. Never let an LLM call a channel adapter.

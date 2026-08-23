# socio

Multi-tenant SaaS for AI-powered social comment moderation and a unified inbox.

Production: [https://socio.seraphsystems.com](https://socio.seraphsystems.com)

V1 (build this): Meta Instagram/Facebook inbox + automatic comment hide with human review. Specs: [`docs/`](./docs/README.md).

## Stack

pnpm · Node 22 (20+) · Fastify · Vite/React · PostgreSQL (Drizzle) · Redis (BullMQ) · Docker Compose

Decisions: [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## Local setup

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3001/health
- Web: http://localhost:5173

Create a workspace in the UI, connect the mock channel, and send a comment such as `This product is a scam` to see auto-hide. Docker must be running for Postgres.

```bash
pnpm check    # biome + typecheck + tests
```

## Production

Everything runs in Docker containers on droplet **socio** (`146.190.132.169`). `erpsys-nginx` proxies `socio.seraphsystems.com` to `socio-web` and does not change other vhosts.

```bash
./scripts/deploy.sh
```

Ritual (commit + push + deploy): say **ritual**.

## Repo layout

```text
apps/web          Vite + React
apps/api          Fastify
apps/worker       BullMQ workers
packages/domain   Shared types and RBAC
packages/db       Drizzle schema
packages/ai       AIProvider + mock
packages/channels ChannelAdapter + mock
packages/moderation Policy engine
packages/automation Phase 5 stub
packages/ui       Shared UI (empty until inbox)
docs              Product and architecture specs
infra             Docker + Apache vhosts
```

## Current status

V1 mock path is live: register a workspace, connect the mock channel, ingest a comment webhook, run AI + policy, auto-hide, and review in the UI.

Meta (Instagram + Facebook) is wired: set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, and a public HTTPS webhook URL, then use **Connect Meta** in Channels. Webhooks: `GET/POST /api/v1/webhooks/meta`. OAuth callback: `/api/v1/channels/oauth/meta/callback`.

Postgres is required (`pnpm docker:up`). BullMQ consumers, invitations, and tags are next.

## Meta app setup

1. Create a Meta app with Instagram + Facebook Login.
2. Valid OAuth redirect (production): `https://socio.seraphsystems.com/api/v1/channels/oauth/meta/callback`. Local: `http://localhost:3001/api/v1/channels/oauth/meta/callback`.
3. Webhooks need a public HTTPS URL pointing at `POST /api/v1/webhooks/meta`, verify token = `META_VERIFY_TOKEN`.
4. Subscribe the app to Instagram `comments` + `messages` and Page `feed` + `messages`.
5. Permissions used: `pages_show_list`, `pages_read_engagement`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `business_management`.
6. Use a Facebook Page with a linked Instagram professional account. App Review is required before production hide works.

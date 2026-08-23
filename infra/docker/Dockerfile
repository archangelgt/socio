# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/channels/package.json packages/channels/package.json
COPY packages/moderation/package.json packages/moderation/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/automation/package.json packages/automation/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

FROM deps AS api
ENV NODE_ENV=production
WORKDIR /app
EXPOSE 3001
CMD ["pnpm", "--filter", "@social-ai/api", "start:prod"]

FROM deps AS worker
ENV NODE_ENV=production
WORKDIR /app
CMD ["pnpm", "--filter", "@social-ai/worker", "start:prod"]

FROM deps AS migrate
ENV NODE_ENV=production
WORKDIR /app
CMD ["pnpm", "--filter", "@social-ai/db", "migrate"]

FROM deps AS web-build
ENV NODE_ENV=production
WORKDIR /app
RUN pnpm --filter @social-ai/web build

FROM nginx:1.27-alpine AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

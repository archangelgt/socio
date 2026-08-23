# Infra

## Local

```bash
pnpm docker:up
```

- PostgreSQL 16 + pgvector (ready for Phase 3)
- Redis 7
- MinIO (S3 API; unused until Brand Brain)

## Production

Droplet **socio** (`146.190.132.169`). App containers join `socio_net`; `socio-web` also joins `root_erpsys-network` so `erpsys-nginx` can proxy it.

```bash
./scripts/deploy.sh
```

- Compose: `docker-compose.prod.yml`
- Image: `infra/docker/Dockerfile`
- Edge vhost: `infra/nginx/socio.conf`
- Server dir: `/opt/socio`

Do not change other nginx vhosts or containers on that host.

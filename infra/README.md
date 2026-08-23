# Infra

## Local

```bash
pnpm docker:up
```

- PostgreSQL 16 + pgvector (ready for Phase 3)
- Redis 7
- MinIO (S3 API; unused until Brand Brain)

## Production

All app processes run in Docker. Apache on the host only proxies `socio.seraphsystems.com` to `127.0.0.1:8090`.

```bash
./scripts/deploy.sh
```

- Compose file: `docker-compose.prod.yml`
- Image: `infra/docker/Dockerfile`
- Vhosts: `infra/apache/socio.conf` and `infra/apache/socio-le-ssl.conf`
- Server dir: `/mnt/volume_nyc1_01/socio`

Do not change other vhosts, containers, or certs on the server.

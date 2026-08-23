---
name: ritual
description: Commit, push, and deploy Socio to socio.seraphsystems.com Docker containers. Use when the user says ritual, the ritual, haz el ritual, commit push deploy, or asks to deploy Socio.
---

# Ritual

Commit, push, and deploy **only** Socio.

Production URL: `https://socio.seraphsystems.com`  
Remote: `git@github.com:archangelgt/socio.git`  
Droplet: `root@146.190.132.169` (DigitalOcean **socio**)  
Server path: `/opt/socio`  
Edge: `erpsys-nginx` via `/root/config/nginx/conf.d/socio.conf`

## Isolation

Never modify other sites, containers, vhosts, or certs.

Allowed:

- `/opt/socio`
- Docker project `socio` (`socio-postgres`, `socio-redis`, `socio-migrate`, `socio-api`, `socio-worker`, `socio-web`)
- `/root/config/nginx/conf.d/socio.conf`
- `/root/config/nginx/ssl/socio/`
- Let's Encrypt cert `socio.seraphsystems.com` (webroot `/root/certbot-webroot`)
- `docker exec erpsys-nginx nginx -t && nginx -s reload`

Forbidden: other files in `/root/config/nginx/conf.d/`, other compose projects, `certbot --expand` onto another cert, `git push --force` to `main`, the `seraphsystems.com` VPS at `67.205.130.140`.

## Steps

1. **Commit** — `git status`, `git diff`; concise English message; no `.env`.
2. **Push** — `git push origin HEAD`
3. **Deploy**
   ```bash
   ./scripts/deploy.sh
   ```
   Confirm `https://socio.seraphsystems.com/health` returns `ok`.

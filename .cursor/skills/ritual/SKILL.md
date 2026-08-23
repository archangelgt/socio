---
name: ritual
description: Commit, push, and deploy Socio to socio.seraphsystems.com Docker containers. Use when the user says ritual, the ritual, haz el ritual, commit push deploy, or asks to deploy Socio.
---

# Ritual

Commit, push, and deploy **only** Socio.

Production URL: `https://socio.seraphsystems.com`  
Remote: `git@github.com:archangelgt/socio.git`  
Server path: `/mnt/volume_nyc1_01/socio`  
Host: `root@seraphsystems.com`  
DNS A record must be this server (`67.205.130.140`), same as `seraphsystems.com`. Do not point `socio` at other droplets.

## Isolation

Never modify other sites, containers, vhosts, certs, or compose projects on the server.

Allowed:

- `/mnt/volume_nyc1_01/socio`
- Docker project `socio` (`socio-postgres`, `socio-redis`, `socio-migrate`, `socio-api`, `socio-worker`, `socio-web`)
- `/etc/httpd/conf.d/socio.conf`
- `/etc/httpd/conf.d/socio-le-ssl.conf`
- Let's Encrypt cert `socio.seraphsystems.com`
- `systemctl reload httpd` after `apachectl configtest`

Forbidden: other `/etc/httpd/conf.d/*`, other docker compose projects, `httpd` restart, expanding other certs, `git push --force` to `main`.

## Steps

Run in order. Do not skip commit/push unless there is nothing to commit.

1. **Commit**
   - `git status`, `git diff`, `git log -8 --oneline`
   - Stage relevant files. Never stage `.env`, `.env.production`, credentials.
   - Concise English commit message (why, not what). HEREDOC. No `--no-verify`.
2. **Push**
   - `git push origin HEAD` (current branch, usually `main`).
3. **Deploy**
   ```bash
   ./scripts/deploy.sh
   ```
   Confirm `https://socio.seraphsystems.com/health` returns `ok`.

If there are no local changes, still push if needed, then deploy.

Do not run the ritual unless the user asked for it.

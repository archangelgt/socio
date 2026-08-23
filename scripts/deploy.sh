#!/usr/bin/env bash
# Deploy Socio to droplet 146.190.132.169 (nomsys-restsys).
# Touches only: /opt/socio, socio_* containers, nginx conf.d/socio.conf, ssl/socio, cert socio.seraphsystems.com.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@146.190.132.169}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/socio}"
COMPOSE="docker-compose.prod.yml"
DOMAIN="socio.seraphsystems.com"
NGINX_DEST="/root/config/nginx/conf.d/socio.conf"
SSL_DEST="/root/config/nginx/ssl/socio"
WEBROOT="/root/certbot-webroot"

cd "$(dirname "$0")/.."

assert_dns() {
  local dns_ip
  dns_ip=$(dig +short "$DOMAIN" A | tail -1)
  if [[ "$dns_ip" != "146.190.132.169" ]]; then
    echo "DNS mismatch: $DOMAIN → ${dns_ip:-none}, expected 146.190.132.169" >&2
    exit 1
  fi
  echo "→ DNS $DOMAIN → $dns_ip"
}

nginx_reload() {
  echo "→ nginx -t && reload erpsys-nginx"
  ssh "$HOST" "docker exec erpsys-nginx nginx -t && docker exec erpsys-nginx nginx -s reload"
}

rsync_code() {
  echo "→ Sync $HOST:$REMOTE_DIR"
  ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
  rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '**/node_modules' \
    --exclude '.turbo' \
    --exclude 'apps/web/dist' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.production' \
    --exclude '.cursor' \
    --exclude 'coverage' \
    --exclude '*.log' \
    ./ "$HOST:$REMOTE_DIR/"
}

ensure_env() {
  ssh "$HOST" "test -f '$REMOTE_DIR/.env'" && {
    echo "→ Keep existing $REMOTE_DIR/.env"
    return
  }
  echo "→ Create $REMOTE_DIR/.env with generated secrets"
  ssh "$HOST" "
    set -euo pipefail
    cd '$REMOTE_DIR'
    PG=\$(openssl rand -hex 24)
    SESSION=\$(openssl rand -hex 32)
    TOKEN=\$(openssl rand -hex 32)
    sed \
      -e \"s|^POSTGRES_PASSWORD=replace-with-hex-secret\$|POSTGRES_PASSWORD=\${PG}|\" \
      -e \"s|^DATABASE_URL=postgres://socio:replace-with-hex-secret@|DATABASE_URL=postgres://socio:\${PG}@|\" \
      -e \"s|^SESSION_SECRET=replace-with-at-least-32-characters\$|SESSION_SECRET=\${SESSION}|\" \
      -e \"s|^TOKEN_ENCRYPTION_KEY=replace-with-hex-secret\$|TOKEN_ENCRYPTION_KEY=\${TOKEN}|\" \
      .env.production.example > .env
    chmod 600 .env
    echo wrote .env
  "
}

compose_up() {
  echo "→ Build and start socio containers only"
  ssh "$HOST" "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE' --env-file .env up -d --build"
}

install_http_vhost() {
  echo "→ Install HTTP nginx vhost $NGINX_DEST (new/replace socio.conf only)"
  ssh "$HOST" "install -m 644 '$REMOTE_DIR/infra/nginx/socio-http.conf' '$NGINX_DEST'"
}

install_ssl_vhost() {
  echo "→ Install HTTPS nginx vhost $NGINX_DEST (socio.conf only)"
  ssh "$HOST" "install -m 644 '$REMOTE_DIR/infra/nginx/socio.conf' '$NGINX_DEST'"
}

ensure_cert() {
  if ssh "$HOST" "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    echo "→ TLS cert already exists for $DOMAIN"
  else
    echo "→ Request Let's Encrypt cert for $DOMAIN only"
    ssh "$HOST" "certbot certonly --webroot -w '$WEBROOT' -d '$DOMAIN' --non-interactive --agree-tos -m gmorales@seraphsystems.com --cert-name '$DOMAIN'"
  fi
  echo "→ Copy cert into nginx ssl/socio"
  ssh "$HOST" "
    set -euo pipefail
    mkdir -p '$SSL_DEST'
    cp -L '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' '$SSL_DEST/'
    cp -L '/etc/letsencrypt/live/$DOMAIN/privkey.pem' '$SSL_DEST/'
  "
}

wait_health() {
  echo "→ Wait for https://$DOMAIN/health"
  for _ in $(seq 1 36); do
    if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
      curl -fsS "https://$DOMAIN/health"
      echo
      return
    fi
    sleep 5
  done
  echo "Health check timed out" >&2
  ssh "$HOST" "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE' ps"
  exit 1
}

assert_dns
rsync_code
ensure_env
compose_up
install_http_vhost
nginx_reload
ensure_cert
install_ssl_vhost
nginx_reload
wait_health
echo "→ Deployed https://$DOMAIN"

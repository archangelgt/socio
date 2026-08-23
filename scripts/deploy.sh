#!/usr/bin/env bash
# Deploy Socio to socio.seraphsystems.com.
# Touches only: /mnt/volume_nyc1_01/socio, socio_* containers, socio Apache vhosts.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@seraphsystems.com}"
REMOTE_DIR="${DEPLOY_DIR:-/mnt/volume_nyc1_01/socio}"
COMPOSE="docker-compose.prod.yml"
DOMAIN="socio.seraphsystems.com"
HTTP_CONF="socio.conf"
SSL_CONF="socio-le-ssl.conf"
HTTP_DEST="/etc/httpd/conf.d/${HTTP_CONF}"
SSL_DEST="/etc/httpd/conf.d/${SSL_CONF}"

cd "$(dirname "$0")/.."

assert_dns() {
  local server_ip dns_ip
  server_ip=$(ssh "$HOST" "hostname -I | awk '{print \$1}'")
  dns_ip=$(dig +short "$DOMAIN" A | tail -1)
  if [[ -z "$dns_ip" ]]; then
    echo "No A record for $DOMAIN" >&2
    exit 1
  fi
  if [[ "$dns_ip" != "$server_ip" ]]; then
    echo "DNS mismatch: $DOMAIN → $dns_ip, this server is $server_ip" >&2
    echo "Point the GoDaddy A record to $server_ip (same as seraphsystems.com), then re-run." >&2
    exit 1
  fi
  echo "→ DNS $DOMAIN → $dns_ip"
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
  echo "→ Install Apache HTTP vhost $HTTP_DEST (new file only)"
  ssh "$HOST" "install -m 644 '$REMOTE_DIR/infra/apache/${HTTP_CONF}' '$HTTP_DEST'"
}

install_ssl_vhost() {
  echo "→ Install Apache SSL vhost $SSL_DEST (new file only)"
  ssh "$HOST" "install -m 644 '$REMOTE_DIR/infra/apache/${SSL_CONF}' '$SSL_DEST'"
}

reload_httpd() {
  echo "→ Apache configtest + graceful reload"
  ssh "$HOST" "apachectl configtest && systemctl reload httpd"
}

ensure_cert() {
  if ssh "$HOST" "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    echo "→ TLS cert already exists for $DOMAIN"
    return
  fi
  echo "→ Request Let's Encrypt cert for $DOMAIN only"
  ssh "$HOST" "certbot certonly --webroot -w /var/www/letsencrypt -d '$DOMAIN' --non-interactive --agree-tos -m gmorales@seraphsystems.com"
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

rsync_code
ensure_env
compose_up
install_http_vhost
reload_httpd
assert_dns
ensure_cert
install_ssl_vhost
reload_httpd
wait_health
echo "→ Deployed https://$DOMAIN"

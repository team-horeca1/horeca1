#!/usr/bin/env bash
# Issue (or renew) Let's Encrypt cert for horeca1.com + www AFTER public DNS
# A/@ and www already point at this droplet (64.227.187.210).
#
# Does NOT touch MX/TXT/NS or email DNS.
# Does NOT change AUTH_URL — update .env.production separately after HTTPS works.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EMAIL="${CERTBOT_EMAIL:-team.horeca1@gmail.com}"
COMPOSE=(docker compose -f docker/docker-compose.prod.yml)
CERT_ROOT=/var/lib/docker/volumes/docker_certbot-etc/_data

echo "==> Checking public DNS for horeca1.com"
APEX_IP="$(dig +short A horeca1.com | head -n1 || true)"
WWW_IP="$(dig +short A www.horeca1.com | head -n1 || true)"
WWW_CNAME="$(dig +short CNAME www.horeca1.com | head -n1 || true)"
echo "    A horeca1.com = ${APEX_IP:-none}"
echo "    A/CNAME www     = ${WWW_IP:-none} ${WWW_CNAME:-}"

if [[ "$APEX_IP" != "64.227.187.210" ]]; then
  echo "ERROR: apex A must be 64.227.187.210 before HTTP-01 can succeed."
  exit 1
fi

# If www is still a Vercel CNAME, warn — cert request includes www.
if [[ -n "$WWW_CNAME" ]] && [[ "$WWW_CNAME" == *vercel* ]]; then
  echo "ERROR: www still points at Vercel ($WWW_CNAME). Change www to A 64.227.187.210 or CNAME horeca1.com."
  exit 1
fi

# Remove temporary self-signed placeholder so certbot can create a real lineage.
if [[ -f "$CERT_ROOT/live/horeca1.com/.selfsigned" ]]; then
  echo "==> Removing temporary self-signed placeholder"
  # Move aside so nginx can keep serving until we swap files — briefly use bootstrap if needed.
  cp docker/nginx.horeca1-http-bootstrap.conf docker/nginx.conf
  docker exec horeca1-nginx nginx -s reload || true
  rm -rf "$CERT_ROOT/live/horeca1.com" "$CERT_ROOT/archive/horeca1.com" \
    "$CERT_ROOT/renewal/horeca1.com.conf" 2>/dev/null || true
fi

echo "==> Requesting certificate (webroot)"
"${COMPOSE[@]}" run --rm certbot certonly \
  --webroot -w /var/lib/letsencrypt \
  -d horeca1.com -d www.horeca1.com \
  --agree-tos --non-interactive -m "$EMAIL" \
  --cert-name horeca1.com

echo "==> Restoring full nginx.conf with HTTPS for horeca1.com"
# Prefer git-tracked config if present
if git show HEAD:docker/nginx.conf >/dev/null 2>&1; then
  git checkout HEAD -- docker/nginx.conf
fi
docker exec horeca1-nginx nginx -t
docker exec horeca1-nginx nginx -s reload

echo "==> Verify"
curl -fsS -o /dev/null -w "https://horeca1.com/api/health -> %{http_code}\n" https://horeca1.com/api/health
curl -fsS -o /dev/null -w "https://www.horeca1.com/ (expect 301) -> %{http_code} loc:%{redirect_url}\n" \
  -o /dev/null https://www.horeca1.com/ || true

echo "Done. Next: set AUTH_URL=https://horeca1.com in /opt/horeca1/.env.production"
echo "      then: docker compose -f docker/docker-compose.prod.yml up -d --force-recreate app worker"

#!/usr/bin/env bash
# Demo deploy — pull SHA-pinned GHCR images, migrate demo DB, seed if empty, restart demo stack.
# Invoked by GitHub Actions (.github/workflows/ci-deploy-demo.yml) or manually on the droplet.
# NEVER touches production containers (horeca1-app / horeca1-db / horeca1-redis).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -p demo -f docker/docker-compose.demo.yml --env-file docker/.env.demo)
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/team-horeca1/horeca1}"
DEPLOY_SHA="${DEPLOY_SHA:-latest}"
APP_TAG="${DEPLOY_IMAGE}:${DEPLOY_SHA}"
WORKER_TAG="${DEPLOY_IMAGE}-worker:${DEPLOY_SHA}"
DEMO_NET="${COMPOSE_PROJECT_NETWORK:-demo_net}"

if [[ ! -f docker/.env.demo ]]; then
  echo "ERROR: docker/.env.demo missing — create it with DEMO_POSTGRES_PASSWORD=..."
  exit 1
fi
if [[ ! -f .env.demo ]]; then
  echo "ERROR: .env.demo missing — create isolated demo secrets (never copy live Razorpay/MSG91)"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source docker/.env.demo
set +a
DEMO_POSTGRES_PASSWORD="${DEMO_POSTGRES_PASSWORD:?DEMO_POSTGRES_PASSWORD missing in docker/.env.demo}"
export DEMO_DEPLOY_SHA="$DEPLOY_SHA"
export DEMO_POSTGRES_PASSWORD

DB_URL="postgresql://horeca1_demo:${DEMO_POSTGRES_PASSWORD}@demo-postgres:5432/horeca1_demo"

# Refuse live Razorpay keys in demo env.
if grep -qE '^RAZORPAY_KEY_ID=rzp_live_' .env.demo 2>/dev/null; then
  echo "ERROR: .env.demo has live Razorpay keys (rzp_live_). Demo must use rzp_test_ only."
  exit 1
fi
if grep -qE '^MSG91_AUTH_KEY=.+' .env.demo 2>/dev/null; then
  echo "WARN: MSG91_AUTH_KEY is set in .env.demo — demo may send real SMS. Prefer unsetting it."
fi

pull_image() {
  local tag="$1"
  local fallback="$2"
  if docker pull "$tag"; then
    return 0
  fi
  echo "WARN: pull failed for $tag — clearing stale GHCR credentials and retrying"
  docker logout ghcr.io >/dev/null 2>&1 || true
  if docker pull "$tag"; then
    return 0
  fi
  echo "WARN: could not pull $tag — falling back to $fallback"
  docker pull "$fallback"
  docker tag "$fallback" "$tag"
}

echo "==> Demo deploy ${DEPLOY_SHA} (${APP_TAG})"
pull_image "$APP_TAG" "${DEPLOY_IMAGE}:latest"
pull_image "$WORKER_TAG" "${DEPLOY_IMAGE}-worker:latest"

echo "==> Ensure demo postgres + redis are up"
"${COMPOSE[@]}" up -d demo-postgres demo-redis

echo "==> Wait for demo postgres"
for i in $(seq 1 30); do
  if docker exec horeca1-demo-db pg_isready -U horeca1_demo -d horeca1_demo >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

migrate() {
  docker run --rm --network "$DEMO_NET" \
    -e DATABASE_URL="$DB_URL" \
    "$WORKER_TAG" \
    npx prisma migrate deploy
}

echo "==> Apply migrations to demo DB"
migrate

user_count="$(docker exec horeca1-demo-db psql -U horeca1_demo -d horeca1_demo -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users';" \
  2>/dev/null | tr -d '[:space:]' || echo 0)"

if [[ "$user_count" == "1" ]]; then
  row_count="$(docker exec horeca1-demo-db psql -U horeca1_demo -d horeca1_demo -tAc \
    "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo 0)"
  if [[ "${row_count:-0}" == "0" ]]; then
    echo "==> Demo DB empty — seeding catalog + demo accounts"
    docker run --rm --network "$DEMO_NET" \
      -e DATABASE_URL="$DB_URL" \
      -e APP_ENV=demo \
      -w /app \
      --entrypoint npx \
      "$WORKER_TAG" \
      tsx prisma/seed.ts || echo "WARN: seed.ts failed — continuing"
    docker run --rm --network "$DEMO_NET" \
      -e DATABASE_URL="$DB_URL" \
      -e APP_ENV=demo \
      -v "$ROOT/prisma/scripts/seed-demo-accounts.ts:/app/prisma/scripts/seed-demo-accounts.ts:ro" \
      -w /app \
      --entrypoint npx \
      "$WORKER_TAG" \
      tsx prisma/scripts/seed-demo-accounts.ts || echo "WARN: seed-demo-accounts failed — continuing"
  else
    echo "==> Demo DB already has ${row_count} users — skip seed"
  fi
fi

echo "==> Restart demo app + worker"
"${COMPOSE[@]}" up -d --force-recreate demo-app demo-worker

# Reload nginx (prod compose) so demo upstream resolves after first bring-up.
if docker ps --format '{{.Names}}' | grep -qx horeca1-nginx; then
  echo "==> Reload nginx (demo vhost)"
  docker exec horeca1-nginx nginx -t && docker exec horeca1-nginx nginx -s reload || true
fi

echo "==> Health check (demo :3001)"
sleep 8
if curl -fsS --max-time 20 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo "OK: demo /api/health"
else
  echo "WARN: demo health check failed — inspect: docker logs --tail 80 horeca1-demo-app"
fi

echo "Demo deploy complete: ${DEPLOY_SHA}"
echo "URL: https://demo.horeca1.com"

# ci-trigger: demo pipeline 2026-09-21T14:14:53.3829533+05:30


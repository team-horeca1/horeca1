#!/usr/bin/env bash
# Production deploy — pull SHA-pinned GHCR images, reconcile migration drift, migrate, restart.
# Invoked by GitHub Actions (.github/workflows/ci-deploy.yml) or manually on the droplet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker/docker-compose.prod.yml)
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/aneeverse/horeca1}"
DEPLOY_SHA="${DEPLOY_SHA:-latest}"
APP_TAG="${DEPLOY_IMAGE}:${DEPLOY_SHA}"
WORKER_TAG="${DEPLOY_IMAGE}-worker:${DEPLOY_SHA}"
NET="${COMPOSE_PROJECT_NETWORK:-docker_default}"

if [[ -f docker/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source docker/.env
  set +a
fi
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing — set it in docker/.env on the droplet}"

DB_URL="postgresql://horeca1:${POSTGRES_PASSWORD}@postgres:5432/horeca1"

pull_image() {
  local tag="$1"
  local fallback="$2"
  if docker pull "$tag"; then
    return 0
  fi
  echo "WARN: could not pull $tag — falling back to $fallback"
  docker pull "$fallback"
  docker tag "$fallback" "$tag"
}

echo "==> Deploy ${DEPLOY_SHA} (${APP_TAG})"
pull_image "$APP_TAG" "${DEPLOY_IMAGE}:latest"
pull_image "$WORKER_TAG" "${DEPLOY_IMAGE}-worker:latest"

# Keep compose :latest tags in sync with the SHA we just pulled.
docker tag "$APP_TAG" "${DEPLOY_IMAGE}:latest"
docker tag "$WORKER_TAG" "${DEPLOY_IMAGE}-worker:latest"

migrate() {
  docker run --rm --network "$NET" \
    -e DATABASE_URL="$DB_URL" \
    "$WORKER_TAG" \
    npx prisma migrate deploy
}

resolve_admin_cipher_drift() {
  if ! docker ps --format '{{.Names}}' | grep -qx horeca1-db; then
    echo "WARN: horeca1-db not running — skipping migration drift check"
    return 0
  fi

  local col_exists
  col_exists="$(docker exec horeca1-db psql -U horeca1 -d horeca1 -tAc \
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='admin_password_cipher' LIMIT 1;" \
    2>/dev/null | tr -d '[:space:]' || true)"

  if [[ "$col_exists" != "1" ]]; then
    return 0
  fi

  echo "==> admin_password_cipher column already exists — marking migration applied if stuck"
  docker run --rm --network "$NET" \
    -e DATABASE_URL="$DB_URL" \
    "$WORKER_TAG" \
    npx prisma migrate resolve --applied 20260708120000_add_admin_password_cipher \
    2>/dev/null || true
}

echo "==> Reconcile known migration drift"
resolve_admin_cipher_drift

echo "==> Apply migrations"
if ! migrate; then
  echo "==> migrate deploy failed — retry after rolled-back resolve"
  docker run --rm --network "$NET" \
    -e DATABASE_URL="$DB_URL" \
    "$WORKER_TAG" \
    npx prisma migrate resolve --rolled-back 20260708120000_add_admin_password_cipher \
    2>/dev/null || true
  migrate
fi

echo "==> Restart app + worker + nginx"
"${COMPOSE[@]}" up -d app worker
"${COMPOSE[@]}" restart nginx

echo "==> Health check"
sleep 6
if curl -fsS --max-time 15 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "OK: /api/health"
elif curl -fsS --max-time 15 http://127.0.0.1/ >/dev/null 2>&1; then
  echo "OK: homepage"
else
  echo "WARN: health check failed — inspect: docker logs --tail 80 horeca1-app"
fi

echo "Deploy complete: ${DEPLOY_SHA}"

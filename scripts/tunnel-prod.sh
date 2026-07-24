#!/usr/bin/env bash
# Opens SSH tunnels to the production database and Redis.
# Run this in a terminal, then use `npm run dev:tunnel` (Turbopack in Docker).
# For local DB only (lighter on memory): `npm run dev:db` then `npm run dev`.
#
# Local ports:
#   5433 → prod Postgres (64.227.187.210:5432)
#   6380 → prod Redis    (64.227.187.210:6379)
#
# Usage: npm run tunnel
#   or:  bash scripts/tunnel-prod.sh

set -e

HOST="root@64.227.187.210"

echo "Opening tunnels to production..."
echo "  Postgres : localhost:5433  →  prod:5432"
echo "  Redis    : localhost:6380  →  prod:6379"
echo ""
echo "Press Ctrl+C to close."

ssh -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -L 5433:127.0.0.1:5432 \
    -L 6380:127.0.0.1:6379 \
    "$HOST" -N

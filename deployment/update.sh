#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/casefun}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "==> Project: $PROJECT_DIR"
echo "==> Branch:  $BRANCH"
cd "$PROJECT_DIR"

echo "==> Backup current HEAD"
git branch "backup-before-deploy-$(date +%F-%H%M)" >/dev/null 2>&1 || true

echo "==> Sync code with origin/$BRANCH"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Rebuild and restart services"
docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate backend frontend caddy

echo "==> Run database migrations"
docker compose -f "$COMPOSE_FILE" exec backend npx prisma migrate deploy

echo "==> Restart caddy"
docker compose -f "$COMPOSE_FILE" restart caddy

echo "==> Service status"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Health check"
curl -fsS https://casefun.net/api/health || true
echo
echo "Deploy finished."

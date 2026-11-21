#!/usr/bin/env bash
# Lance les tests de bout en bout sur une base dédiée (vault_e2e) et un serveur de dev éphémère (port 5174).
# Prérequis : `npm run db:start` (Postgres Docker).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
BASE_URL="postgres://vault:${POSTGRES_PASSWORD}@localhost:5440"
E2E_DB_URL="${BASE_URL}/vault_e2e"
PORT=5174

docker compose exec -T db psql -U vault -d vault -tc "select 1 from pg_database where datname='vault_e2e'" | grep -q 1 \
  || docker compose exec -T db psql -U vault -d vault -c "create database vault_e2e" >/dev/null

DATABASE_URL="$E2E_DB_URL" npx drizzle-kit migrate >/dev/null

if curl -s -o /dev/null "http://localhost:${PORT}/"; then
  echo "Le port ${PORT} est déjà utilisé (ancien serveur de test ?). Arrêtez-le avant de relancer." >&2
  exit 1
fi

# setsid : le serveur et ses enfants forment un groupe de processus qu'on tue d'un coup à la fin
DATABASE_URL="$E2E_DB_URL" APP_URL="http://localhost:${PORT}" SMTP_HOST="" \
  setsid node node_modules/vite/bin/vite.js dev --port "$PORT" --strictPort >/tmp/vault-e2e-server.log 2>&1 &
SERVER_PID=$!
trap 'kill -- -$SERVER_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:${PORT}/api/me" && break
  sleep 1
done

E2E_BASE_URL="http://localhost:${PORT}" E2E_DATABASE_URL="$E2E_DB_URL" \
  npx vitest run --config e2e/vitest.config.ts "$@"

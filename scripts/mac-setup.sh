#!/usr/bin/env bash
# Gravitas Campus — one-command local setup on a Mac (Colima + Docker).
# Usage (from the project folder):  bash scripts/mac-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v node >/dev/null || { echo "❌ Node.js is missing. Install it: brew install node@22"; exit 1; }
command -v colima >/dev/null || { echo "❌ Colima is missing. Install it: brew install colima docker"; exit 1; }
command -v docker >/dev/null || { echo "❌ Docker CLI is missing. Install it: brew install docker"; exit 1; }

echo "▶ Starting Colima…"
colima status >/dev/null 2>&1 || colima start

if docker ps -a --format '{{.Names}}' | grep -qx gravitas-pg; then
  echo "▶ Starting existing database container…"
  docker start gravitas-pg >/dev/null
else
  echo "▶ Creating database container (gravitas-pg)…"
  docker run -d --name gravitas-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gravitas \
    -p 5432:5432 -v gravitas-pg-data:/var/lib/postgresql/data postgres:16 >/dev/null
fi

echo "▶ Waiting for the database…"
for i in $(seq 1 30); do docker exec gravitas-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

[ -f .env.local ] || cp .env.example .env.local
[ -d node_modules ] || { echo "▶ Installing packages (first time only)…"; npm install; }

echo "▶ Setting up tables and demo data…"
npm run db:migrate
npm run db:seed

echo ""
echo "✅ Ready! Starting the app — open http://localhost:3000  (press Ctrl+C to stop)"
npm run dev

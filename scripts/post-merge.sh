#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply all SQL migrations (all are idempotent — safe to re-run)
echo "Applying SQL migrations..."
for f in lib/db/migrations/*.sql; do
  echo "  -> $f"
  psql "$DATABASE_URL" -f "$f" || true
done

# Push schema changes — use --force to skip all interactive prompts
pnpm --filter db push --force || true

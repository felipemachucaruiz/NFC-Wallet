#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply all SQL migrations (all are idempotent — safe to re-run)
echo "Applying SQL migrations..."
for f in lib/db/migrations/*.sql; do
  echo "  -> $f"
  psql "$DATABASE_URL" -f "$f" || true
done

# Sync schema with --force to handle column renames / drops without interactive prompts
pnpm --filter db push-force || true

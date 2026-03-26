#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply all SQL migrations (all are idempotent — safe to re-run)
echo "Applying SQL migrations..."
for f in lib/db/migrations/*.sql; do
  echo "  -> $f"
  psql "$DATABASE_URL" -f "$f" || true
done

# Push schema changes; auto-accept "No, add constraint without truncating" prompts
printf '\n\n\n\n\n' | pnpm --filter db push || true

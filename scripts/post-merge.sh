#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Push schema changes; auto-accept "No, add constraint without truncating" prompts
printf '\n\n\n\n\n' | pnpm --filter db push || true

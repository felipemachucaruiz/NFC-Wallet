ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "hmac_secret" varchar(128),
  ADD COLUMN IF NOT EXISTS "offline_sync_limit" integer NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS "max_offline_spend_per_bracelet" integer NOT NULL DEFAULT 200000;

ALTER TABLE "bracelets"
  ADD COLUMN IF NOT EXISTS "max_offline_spend" integer;

-- Back-fill hmac_secret for existing events that don't have one
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE "events"
  SET "hmac_secret" = encode(gen_random_bytes(32), 'hex')
  WHERE "hmac_secret" IS NULL;

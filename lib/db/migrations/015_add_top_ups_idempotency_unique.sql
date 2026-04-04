-- Add unique constraint on top_ups.idempotency_key if it doesn't already exist.
-- Idempotent — safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'top_ups_idempotency_key_unique' AND conrelid = 'top_ups'::regclass
  ) THEN
    ALTER TABLE top_ups ADD CONSTRAINT top_ups_idempotency_key_unique UNIQUE (idempotency_key);
  END IF;
END
$$;

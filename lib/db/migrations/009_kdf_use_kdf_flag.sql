-- Add use_kdf flag to events table
-- New events default to true (KDF enabled); existing events default to false (legacy)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS use_kdf boolean NOT NULL DEFAULT false;

-- New events should use KDF by default, so we update the column default
-- Existing rows keep false (legacy) to avoid breaking live events
-- The application code will set use_kdf=true for newly created events
ALTER TABLE events ALTER COLUMN use_kdf SET DEFAULT true;

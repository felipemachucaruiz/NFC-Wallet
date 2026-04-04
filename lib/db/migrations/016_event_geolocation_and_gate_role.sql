-- Add latitude/longitude to events table for proximity-based discovery
ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude numeric(10, 7);
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude numeric(10, 7);

-- Add 'gate' role to the user_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'gate'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'gate';
  END IF;
END
$$;

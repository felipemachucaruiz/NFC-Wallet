-- Rename the existing unique constraint on users.username to the name
-- drizzle-kit expects, so that drizzle-kit push no longer prompts.
-- Idempotent: skips if target name already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_key' AND conrelid = 'users'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_unique' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users RENAME CONSTRAINT users_username_key TO users_username_unique;
  END IF;
END
$$;

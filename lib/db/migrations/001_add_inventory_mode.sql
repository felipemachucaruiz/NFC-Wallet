DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_mode') THEN
    CREATE TYPE "public"."inventory_mode" AS ENUM('location_based', 'centralized_warehouse');
  END IF;
END
$$;

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "inventory_mode" "inventory_mode" DEFAULT 'location_based' NOT NULL;

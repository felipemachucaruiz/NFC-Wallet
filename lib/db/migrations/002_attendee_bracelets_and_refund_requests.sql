DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendee_refund_method') THEN
    CREATE TYPE "public"."attendee_refund_method" AS ENUM('cash', 'nequi', 'bancolombia', 'other');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendee_refund_request_status') THEN
    CREATE TYPE "public"."attendee_refund_request_status" AS ENUM('pending', 'approved', 'rejected');
  END IF;
END
$$;

ALTER TABLE "bracelets"
  ADD COLUMN IF NOT EXISTS "attendee_user_id" varchar REFERENCES "users"("id");

CREATE TABLE IF NOT EXISTS "attendee_refund_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "attendee_user_id" varchar NOT NULL REFERENCES "users"("id"),
  "bracelet_uid" varchar(64) NOT NULL,
  "event_id" varchar NOT NULL,
  "amount_cop" integer NOT NULL,
  "refund_method" "attendee_refund_method" NOT NULL,
  "account_details" text,
  "notes" text,
  "status" "attendee_refund_request_status" NOT NULL DEFAULT 'pending',
  "processed_by_user_id" varchar REFERENCES "users"("id"),
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

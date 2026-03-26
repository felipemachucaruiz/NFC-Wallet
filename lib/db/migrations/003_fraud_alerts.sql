DO $$ BEGIN
  CREATE TYPE fraud_alert_type AS ENUM (
    'double_location',
    'offline_volume_anomaly',
    'high_value_staff',
    'balance_increase_no_topup',
    'manual_report',
    'hmac_invalid'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fraud_alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fraud_alert_entity_type AS ENUM ('bracelet', 'pos', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fraud_alert_status AS ENUM ('open', 'reviewed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "fraud_alerts" (
  "id"          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"    varchar NOT NULL REFERENCES "events"("id"),
  "type"        fraud_alert_type NOT NULL,
  "severity"    fraud_alert_severity NOT NULL,
  "entity_type" fraud_alert_entity_type NOT NULL,
  "entity_id"   varchar(255) NOT NULL,
  "description" text NOT NULL,
  "reported_by" varchar REFERENCES "users"("id"),
  "status"      fraud_alert_status NOT NULL DEFAULT 'open',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fraud_alerts_event_id_idx" ON "fraud_alerts"("event_id");
CREATE INDEX IF NOT EXISTS "fraud_alerts_status_idx" ON "fraud_alerts"("status");
CREATE INDEX IF NOT EXISTS "fraud_alerts_severity_idx" ON "fraud_alerts"("severity");

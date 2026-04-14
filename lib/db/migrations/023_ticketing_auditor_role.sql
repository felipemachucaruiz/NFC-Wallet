-- Add ticketing_auditor role and related audit log tables

-- 1. Add ticketing_auditor to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ticketing_auditor';

-- 2. Create auditor_login_activity table (tracks each login by a ticketing_auditor)
CREATE TABLE IF NOT EXISTS auditor_login_activity (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_in_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address varchar(45)
);

CREATE INDEX IF NOT EXISTS idx_auditor_login_activity_user_id ON auditor_login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_auditor_login_activity_logged_in_at ON auditor_login_activity(logged_in_at);

-- 3. Create auditor_csv_downloads table (tracks each CSV export by a ticketing_auditor)
CREATE TABLE IF NOT EXISTS auditor_csv_downloads (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  downloaded_at timestamp with time zone NOT NULL DEFAULT now(),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_auditor_csv_downloads_user_id ON auditor_csv_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_auditor_csv_downloads_downloaded_at ON auditor_csv_downloads(downloaded_at);

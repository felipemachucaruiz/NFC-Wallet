-- Track when an attendee transfers (unlinks) a bracelet so it appears in transaction history
CREATE TABLE IF NOT EXISTS bracelet_transfer_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  bracelet_uid varchar(64) NOT NULL,
  from_user_id varchar NOT NULL REFERENCES users(id),
  balance_cop integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

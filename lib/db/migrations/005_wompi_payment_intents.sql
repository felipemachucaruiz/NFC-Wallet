ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'nequi' AFTER 'bancolombia_transfer';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pse' AFTER 'nequi';

DO $$ BEGIN
  CREATE TYPE wompi_payment_method AS ENUM ('nequi', 'pse');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wompi_payment_status AS ENUM ('pending', 'processing', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wompi_payment_intents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  bracelet_uid VARCHAR(64) NOT NULL,
  amount_cop INTEGER NOT NULL,
  payment_method wompi_payment_method NOT NULL,
  phone_number VARCHAR(20),
  bank_code VARCHAR(20),
  wompi_transaction_id VARCHAR,
  wompi_reference VARCHAR,
  redirect_url TEXT,
  status wompi_payment_status NOT NULL DEFAULT 'pending',
  top_up_id VARCHAR,
  performed_by_user_id VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wompi_intents_wompi_tx_id ON wompi_payment_intents(wompi_transaction_id);
CREATE INDEX IF NOT EXISTS idx_wompi_intents_bracelet ON wompi_payment_intents(bracelet_uid);
CREATE INDEX IF NOT EXISTS idx_wompi_intents_status ON wompi_payment_intents(status);

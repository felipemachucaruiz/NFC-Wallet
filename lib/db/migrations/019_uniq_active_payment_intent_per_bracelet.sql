-- Migration 019: Partial unique indexes for active Wompi payment intents per bracelet
-- Enforces at the DB level that at most one pending and one processing intent can
-- exist per bracelet at any time. Hardens the app-level duplicate guard against
-- concurrent race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_payment_intent_per_bracelet
  ON wompi_payment_intents (bracelet_uid)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_processing_payment_intent_per_bracelet
  ON wompi_payment_intents (bracelet_uid)
  WHERE status = 'processing';

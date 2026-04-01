-- Add pending_sync fields to bracelets for self-service top-up tracking
ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS pending_sync boolean NOT NULL DEFAULT false;
ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS pending_balance_cop integer NOT NULL DEFAULT 0;

-- Allow anonymous self-service payments (no user account required)
ALTER TABLE wompi_payment_intents ALTER COLUMN performed_by_user_id DROP NOT NULL;
ALTER TABLE wompi_payment_intents ADD COLUMN IF NOT EXISTS self_service boolean NOT NULL DEFAULT false;

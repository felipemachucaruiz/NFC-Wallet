-- Add tip_amount_cop column to transaction_logs table
-- Tip is stored separately from gross sales; commission is NOT applied to tips
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS tip_amount_cop integer NOT NULL DEFAULT 0;

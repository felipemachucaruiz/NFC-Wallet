-- Add pending_wallet_balance to users table for pre-event balance top-up
-- Attendees can load balance before being assigned a physical bracelet.
-- When the bracelet is registered at the gate, this amount is written to the chip.

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_wallet_balance integer NOT NULL DEFAULT 0;

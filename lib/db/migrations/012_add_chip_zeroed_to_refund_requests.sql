-- Migration 012: Add chip_zeroed tracking to refund requests
-- After a refund is approved, bank staff must tap the bracelet to write
-- balance=0 to the physical NFC chip. This column tracks whether that
-- write-back has completed, so attendees can see accurate status.
-- Default false: existing rows are treated as not yet chip-zeroed.
ALTER TABLE attendee_refund_requests
  ADD COLUMN IF NOT EXISTS chip_zeroed boolean NOT NULL DEFAULT false;

-- Add disbursement tracking fields to attendee_refund_requests
-- and extend the status enum to include disbursement lifecycle states.

ALTER TYPE attendee_refund_request_status ADD VALUE IF NOT EXISTS 'disbursement_pending';
ALTER TYPE attendee_refund_request_status ADD VALUE IF NOT EXISTS 'disbursement_completed';
ALTER TYPE attendee_refund_request_status ADD VALUE IF NOT EXISTS 'disbursement_failed';

ALTER TABLE attendee_refund_requests
  ADD COLUMN IF NOT EXISTS disbursement_reference VARCHAR,
  ADD COLUMN IF NOT EXISTS disbursement_wompi_id VARCHAR,
  ADD COLUMN IF NOT EXISTS disbursement_error TEXT;

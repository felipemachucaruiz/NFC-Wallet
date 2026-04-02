-- Migration 011: Partial unique index for pending attendee refund requests
-- Enforces at the DB level that only one pending refund request can exist per
-- bracelet at any time. Prevents concurrent race conditions beyond app-level checks.
-- Approved/rejected historical rows are NOT affected (partial WHERE clause).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_refund_per_bracelet
  ON attendee_refund_requests (bracelet_uid)
  WHERE status = 'pending';

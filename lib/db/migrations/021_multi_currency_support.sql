-- Multi-currency support: rename _cop columns to currency-neutral names
-- and add currency_code to events table

-- 1. Add currency_code to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS currency_code varchar(10) NOT NULL DEFAULT 'COP';

-- 2. Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency varchar(10) NOT NULL,
  target_currency varchar(10) NOT NULL,
  rate numeric(18,6) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Rename columns in bracelets
ALTER TABLE bracelets RENAME COLUMN last_known_balance_cop TO last_known_balance;
ALTER TABLE bracelets RENAME COLUMN pending_balance_cop TO pending_balance;

-- 4. Rename columns in transaction_logs
ALTER TABLE transaction_logs RENAME COLUMN gross_amount_cop TO gross_amount;
ALTER TABLE transaction_logs RENAME COLUMN tip_amount_cop TO tip_amount;
ALTER TABLE transaction_logs RENAME COLUMN commission_amount_cop TO commission_amount;
ALTER TABLE transaction_logs RENAME COLUMN net_amount_cop TO net_amount;
ALTER TABLE transaction_logs RENAME COLUMN new_balance_cop TO new_balance;

-- 5. Rename columns in transaction_line_items
ALTER TABLE transaction_line_items RENAME COLUMN iva_amount_cop TO iva_amount;
ALTER TABLE transaction_line_items RENAME COLUMN retencion_fuente_amount_cop TO retencion_fuente_amount;
ALTER TABLE transaction_line_items RENAME COLUMN retencion_ica_amount_cop TO retencion_ica_amount;

-- 6. Rename columns in top_ups
ALTER TABLE top_ups RENAME COLUMN amount_cop TO amount;
ALTER TABLE top_ups RENAME COLUMN new_balance_cop TO new_balance;

-- 7. Rename columns in merchant_payouts
ALTER TABLE merchant_payouts RENAME COLUMN gross_sales_cop TO gross_sales;
ALTER TABLE merchant_payouts RENAME COLUMN commission_cop TO commission;
ALTER TABLE merchant_payouts RENAME COLUMN net_payout_cop TO net_payout;

-- 8. Rename columns in products
ALTER TABLE products RENAME COLUMN price_cop TO price;
ALTER TABLE products RENAME COLUMN cost_cop TO cost;

-- 9. Rename columns in refunds
ALTER TABLE refunds RENAME COLUMN amount_cop TO amount;

-- 10. Rename columns in attendee_refund_requests
ALTER TABLE attendee_refund_requests RENAME COLUMN amount_cop TO amount;

-- 11. Rename columns in wompi_payment_intents
ALTER TABLE wompi_payment_intents RENAME COLUMN amount_cop TO amount;

-- 12. Rename columns in access_zones
ALTER TABLE access_zones RENAME COLUMN upgrade_price_cop TO upgrade_price;

-- 13. Rename columns in bracelet_transfer_logs
ALTER TABLE bracelet_transfer_logs RENAME COLUMN balance_cop TO balance;

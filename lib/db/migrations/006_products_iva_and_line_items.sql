-- Add IVA fields to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_exento BOOLEAN NOT NULL DEFAULT false;

-- Add IVA and retencion fields to transaction_line_items
ALTER TABLE transaction_line_items
  ADD COLUMN IF NOT EXISTS iva_amount_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_fuente_amount_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_ica_amount_cop INTEGER NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_merchant_uniq
  ON products (merchant_id, barcode)
  WHERE barcode IS NOT NULL;

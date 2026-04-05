-- Create damaged_goods_reason enum
CREATE TYPE damaged_goods_reason AS ENUM ('damaged', 'lost', 'expired');

-- Create inventory_audits table
CREATE TABLE inventory_audits (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id VARCHAR REFERENCES warehouses(id),
  location_id VARCHAR REFERENCES locations(id),
  performed_by_user_id VARCHAR REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create inventory_audit_items table
CREATE TABLE inventory_audit_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id VARCHAR NOT NULL REFERENCES inventory_audits(id),
  product_id VARCHAR NOT NULL REFERENCES products(id),
  system_count INTEGER NOT NULL,
  physical_count INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create damaged_goods table
CREATE TABLE damaged_goods (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id VARCHAR REFERENCES warehouses(id),
  location_id VARCHAR REFERENCES locations(id),
  product_id VARCHAR NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  reason damaged_goods_reason NOT NULL,
  notes TEXT,
  performed_by_user_id VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

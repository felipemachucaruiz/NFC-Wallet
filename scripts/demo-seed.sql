-- Demo Quick-Switch seed users
-- Run against the production DB:
--   psql "$RAILWAY_DATABASE_URL" -f scripts/demo-seed.sql
--
-- After inserting, update the merchant_id / event_id columns for each role:
--   UPDATE users SET event_id = '<real-event-id>' WHERE username LIKE 'demo_%';
--   UPDATE users SET merchant_id = '<real-merchant-id>' WHERE username IN ('demo_merchant_staff','demo_merchant_admin');
--
-- These accounts have no password hash — they can only be accessed via
-- POST /api/auth/demo-login (protected by DEMO_SECRET env var).

INSERT INTO users (username, email, first_name, last_name, role, event_id, merchant_id)
VALUES
  ('demo_admin',           'demo_admin@tapee.app',           'Demo', 'Admin',           'admin',           NULL, NULL),
  ('demo_event_admin',     'demo_event_admin@tapee.app',     'Demo', 'Event Admin',      'event_admin',     NULL, NULL),
  ('demo_bank',            'demo_bank@tapee.app',            'Demo', 'Bank',             'bank',            NULL, NULL),
  ('demo_gate',            'demo_gate@tapee.app',            'Demo', 'Gate',             'gate',            NULL, NULL),
  ('demo_merchant_admin',  'demo_merchant_admin@tapee.app',  'Demo', 'Merchant Admin',   'merchant_admin',  NULL, NULL),
  ('demo_merchant_staff',  'demo_merchant_staff@tapee.app',  'Demo', 'Merchant Staff',   'merchant_staff',  NULL, NULL),
  ('demo_warehouse_admin', 'demo_warehouse_admin@tapee.app', 'Demo', 'Warehouse Admin',  'warehouse_admin', NULL, NULL),
  ('demo_box_office',      'demo_box_office@tapee.app',      'Demo', 'Box Office',       'box_office',      NULL, NULL)
ON CONFLICT (username) DO NOTHING;

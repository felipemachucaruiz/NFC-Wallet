-- Demo Quick-Switch full seed
-- Creates: demo event, 2 merchants, locations, products, warehouse, access zone
-- Links all demo_<role> users to the appropriate event/merchant IDs
-- Safe to run multiple times (skips if demo event already exists).
--
-- Step 1 — insert demo users (idempotent):
INSERT INTO users (username, email, first_name, last_name, role)
VALUES
  ('demo_admin',           'demo_admin@tapee.app',           'Demo', 'Admin',           'admin'),
  ('demo_event_admin',     'demo_event_admin@tapee.app',     'Demo', 'Event Admin',      'event_admin'),
  ('demo_bank',            'demo_bank@tapee.app',            'Demo', 'Bank',             'bank'),
  ('demo_gate',            'demo_gate@tapee.app',            'Demo', 'Gate',             'gate'),
  ('demo_merchant_admin',  'demo_merchant_admin@tapee.app',  'Demo', 'Merchant Admin',   'merchant_admin'),
  ('demo_merchant_staff',  'demo_merchant_staff@tapee.app',  'Demo', 'Merchant Staff',   'merchant_staff'),
  ('demo_warehouse_admin', 'demo_warehouse_admin@tapee.app', 'Demo', 'Warehouse Admin',  'warehouse_admin'),
  ('demo_box_office',      'demo_box_office@tapee.app',      'Demo', 'Box Office',       'box_office')
ON CONFLICT (username) DO NOTHING;

-- Step 2 — create demo event + related data and link users:
DO $$
DECLARE
  v_event_id       varchar;
  v_merchant_food  varchar;
  v_merchant_merch varchar;
  v_warehouse_id   varchar;
  v_zone_id        varchar;
  v_loc_food       varchar;
  v_loc_merch      varchar;
BEGIN
  -- Skip if already seeded
  SELECT id INTO v_event_id FROM events WHERE slug = 'demo-tapee' LIMIT 1;
  IF v_event_id IS NOT NULL THEN
    RAISE NOTICE 'Demo event already exists (id: %). Skipping.', v_event_id;
    RETURN;
  END IF;

  -- 1. Demo event
  INSERT INTO events (
    name, slug, description, venue_address,
    starts_at, ends_at,
    active, currency_code,
    hmac_secret,
    ticketing_enabled, nfc_bracelets_enabled,
    inventory_mode, timezone
  ) VALUES (
    'Demo Event Tapee',
    'demo-tapee',
    'Evento de demostración para presentaciones de Tapee.',
    'Centro de Eventos, Bogotá, Colombia',
    NOW(),
    NOW() + INTERVAL '3 days',
    true, 'COP',
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    true, true,
    'centralized_warehouse',
    'America/Bogota'
  ) RETURNING id INTO v_event_id;
  RAISE NOTICE 'Created demo event: %', v_event_id;

  -- 2. Merchants
  INSERT INTO merchants (event_id, name, description, merchant_type)
    VALUES (v_event_id, 'Demo Comidas & Bebidas', 'Stand de alimentos y bebidas', 'event_managed')
    RETURNING id INTO v_merchant_food;

  INSERT INTO merchants (event_id, name, description, merchant_type)
    VALUES (v_event_id, 'Demo Merch & Souvenirs', 'Productos de merchandising del evento', 'event_managed')
    RETURNING id INTO v_merchant_merch;
  RAISE NOTICE 'Created merchants: food=%, merch=%', v_merchant_food, v_merchant_merch;

  -- 3. Locations
  INSERT INTO locations (merchant_id, event_id, name)
    VALUES (v_merchant_food, v_event_id, 'Puesto Principal')
    RETURNING id INTO v_loc_food;

  INSERT INTO locations (merchant_id, event_id, name)
    VALUES (v_merchant_merch, v_event_id, 'Tienda Oficial')
    RETURNING id INTO v_loc_merch;

  -- 4. Products — food
  INSERT INTO products (merchant_id, name, price, category) VALUES
    (v_merchant_food, 'Cerveza',        15000, 'Bebidas'),
    (v_merchant_food, 'Agua Botella',    5000, 'Bebidas'),
    (v_merchant_food, 'Gaseosa',         8000, 'Bebidas'),
    (v_merchant_food, 'Hamburguesa',    25000, 'Comidas'),
    (v_merchant_food, 'Perro Caliente', 20000, 'Comidas'),
    (v_merchant_food, 'Empanada',        8000, 'Comidas');

  -- Products — merch
  INSERT INTO products (merchant_id, name, price, category) VALUES
    (v_merchant_merch, 'Camiseta Tapee', 50000, 'Ropa'),
    (v_merchant_merch, 'Gorra Tapee',   35000, 'Accesorios'),
    (v_merchant_merch, 'Pulsera NFC',   15000, 'Accesorios');

  -- 5. Warehouse
  INSERT INTO warehouses (event_id, name)
    VALUES (v_event_id, 'Almacén Principal')
    RETURNING id INTO v_warehouse_id;
  RAISE NOTICE 'Created warehouse: %', v_warehouse_id;

  -- 6. Access zone
  INSERT INTO access_zones (event_id, name, description, color_hex, rank)
    VALUES (v_event_id, 'Zona General', 'Acceso general al evento', '#6366F1', 1)
    RETURNING id INTO v_zone_id;
  RAISE NOTICE 'Created access zone: %', v_zone_id;

  -- 7. Link demo users
  UPDATE users SET event_id = v_event_id
    WHERE username IN ('demo_event_admin','demo_bank','demo_gate','demo_warehouse_admin','demo_box_office');

  UPDATE users SET merchant_id = v_merchant_food, event_id = v_event_id
    WHERE username IN ('demo_merchant_staff','demo_merchant_admin');

  UPDATE users SET gate_zone_id = v_zone_id
    WHERE username = 'demo_gate';

  RAISE NOTICE 'Demo seed complete.';
  RAISE NOTICE '  event_id      : %', v_event_id;
  RAISE NOTICE '  merchant_food : %', v_merchant_food;
  RAISE NOTICE '  merchant_merch: %', v_merchant_merch;
  RAISE NOTICE '  warehouse_id  : %', v_warehouse_id;
  RAISE NOTICE '  zone_id       : %', v_zone_id;
END $$;

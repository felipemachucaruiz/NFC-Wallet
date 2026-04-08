// gate role added to UserRole enum — force rebuild
import { pool } from "@workspace/db";
import { db, sessionsTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info("Running startup migrations…");

    // Must run outside transaction block (ALTER TYPE ADD VALUE restriction)
    await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gate'`);
    await client.query(`ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'manual_adjustment'`);

    await client.query(`
      -- ── Enum types (idempotent) ────────────────────────────────────────────
      DO $$ BEGIN
        CREATE TYPE nfc_chip_type AS ENUM ('ntag_21x', 'mifare_classic', 'desfire_ev3', 'mifare_ultralight_c');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE inventory_mode AS ENUM ('location_based', 'centralized_warehouse');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── promoter_companies table ───────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS promoter_companies (
        id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name varchar NOT NULL,
        nit          varchar,
        address      varchar,
        phone        varchar,
        email        varchar,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      );

      -- ── access_zones table ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS access_zones (
        id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id          varchar NOT NULL REFERENCES events(id),
        name              varchar(255) NOT NULL,
        description       text,
        color_hex         varchar(9) DEFAULT '#6366F1',
        rank              integer NOT NULL,
        upgrade_price_cop integer,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        UNIQUE (event_id, rank)
      );

      -- ── access_upgrades table ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS access_upgrades (
        id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        bracelet_id           varchar NOT NULL REFERENCES bracelets(id),
        zone_ids_added        text[] NOT NULL DEFAULT '{}',
        performed_by_user_id  varchar NOT NULL REFERENCES users(id),
        note                  text,
        created_at            timestamptz NOT NULL DEFAULT now()
      );

      -- ── users: recent columns ──────────────────────────────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS promoter_company_id  varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token      varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone                varchar(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gate_zone_id         varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked           boolean NOT NULL DEFAULT false;

      -- ── events: timezone column ────────────────────────────────────────────
      ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone varchar(100) NOT NULL DEFAULT 'UTC';

      -- ── users: auth security columns (task-85) ────────────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified       boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret          varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled         boolean NOT NULL DEFAULT false;

      -- ── password_reset_tokens table ───────────────────────────────────────
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token      varchar PRIMARY KEY,
        user_id    varchar NOT NULL,
        expires_at timestamptz NOT NULL,
        used       boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS IDX_password_reset_tokens_user_id ON password_reset_tokens (user_id);

      -- ── email_verification_tokens table ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token      varchar PRIMARY KEY,
        user_id    varchar NOT NULL,
        expires_at timestamptz NOT NULL,
        used       boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS IDX_email_verification_tokens_user_id ON email_verification_tokens (user_id);

      -- ── partial_sessions table (2FA challenge sessions) ───────────────────
      CREATE TABLE IF NOT EXISTS partial_sessions (
        sid        varchar PRIMARY KEY,
        user_id    varchar NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- ── bracelets: recent columns ──────────────────────────────────────────
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS access_zone_ids  text[] NOT NULL DEFAULT '{}';
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS max_offline_spend integer;

      -- ── events: recent columns ─────────────────────────────────────────────
      ALTER TABLE events ADD COLUMN IF NOT EXISTS promoter_company_id varchar;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS pulep_id            varchar(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS offline_sync_limit
        integer NOT NULL DEFAULT 500000;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS max_offline_spend_per_bracelet
        integer NOT NULL DEFAULT 200000;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS nfc_chip_type
        nfc_chip_type NOT NULL DEFAULT 'ntag_21x';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS allowed_nfc_types
        jsonb NOT NULL DEFAULT '["ntag_21x"]'::jsonb;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS ultralight_c_des_key varchar(32);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS inventory_mode
        inventory_mode NOT NULL DEFAULT 'location_based';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude  numeric(9,6);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

      -- ── transaction_logs: tip column ───────────────────────────────────────
      DO $$ BEGIN
        ALTER TABLE transaction_logs ADD COLUMN tip_amount integer NOT NULL DEFAULT 0;
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_logs ADD COLUMN tip_amount_cop integer NOT NULL DEFAULT 0;
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;

      -- ── Multi-currency support ─────────────────────────────────────────────
      ALTER TABLE events ADD COLUMN IF NOT EXISTS currency_code varchar(10) NOT NULL DEFAULT 'COP';

      CREATE TABLE IF NOT EXISTS exchange_rates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        base_currency varchar(10) NOT NULL,
        target_currency varchar(10) NOT NULL,
        rate numeric(18,6) NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now()
      );

      -- ── FK constraint for gate_zone_id (idempotent) ────────────────────────
      DO $$ BEGIN
        ALTER TABLE users
          ADD CONSTRAINT users_gate_zone_id_fk
          FOREIGN KEY (gate_zone_id) REFERENCES access_zones(id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── Add 'expired' to wompi_payment_status enum (idempotent) ──────────
      ALTER TYPE wompi_payment_status ADD VALUE IF NOT EXISTS 'expired';

      -- ── Inventory non-negative CHECK constraints (idempotent) ───────────────
      DO $$ BEGIN
        ALTER TABLE location_inventory
          ADD CONSTRAINT location_inventory_qty_non_negative
          CHECK (quantity_on_hand >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE warehouse_inventory
          ADD CONSTRAINT warehouse_inventory_qty_non_negative
          CHECK (quantity_on_hand >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- (no additional seeding required)
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE bracelets RENAME COLUMN last_known_balance_cop TO last_known_balance;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE bracelets RENAME COLUMN pending_balance_cop TO pending_balance;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE transaction_logs RENAME COLUMN gross_amount_cop TO gross_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_logs RENAME COLUMN tip_amount_cop TO tip_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_logs RENAME COLUMN commission_amount_cop TO commission_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_logs RENAME COLUMN net_amount_cop TO net_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_logs RENAME COLUMN new_balance_cop TO new_balance;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE transaction_line_items RENAME COLUMN iva_amount_cop TO iva_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_line_items RENAME COLUMN retencion_fuente_amount_cop TO retencion_fuente_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE transaction_line_items RENAME COLUMN retencion_ica_amount_cop TO retencion_ica_amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE top_ups RENAME COLUMN amount_cop TO amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE top_ups RENAME COLUMN new_balance_cop TO new_balance;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE merchant_payouts RENAME COLUMN gross_sales_cop TO gross_sales;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE merchant_payouts RENAME COLUMN commission_cop TO commission;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE merchant_payouts RENAME COLUMN net_payout_cop TO net_payout;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE products RENAME COLUMN price_cop TO price;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE products RENAME COLUMN cost_cop TO cost;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE refunds RENAME COLUMN amount_cop TO amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE attendee_refund_requests RENAME COLUMN amount_cop TO amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE wompi_payment_intents RENAME COLUMN amount_cop TO amount;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE access_zones RENAME COLUMN upgrade_price_cop TO upgrade_price;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE bracelet_transfer_logs RENAME COLUMN balance_cop TO balance;
      EXCEPTION WHEN undefined_column OR duplicate_column THEN NULL; END $$;

      -- Migrate data from leftover _cop column if both exist, then drop
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_logs' AND column_name='tip_amount_cop')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_logs' AND column_name='tip_amount') THEN
          UPDATE transaction_logs SET tip_amount = tip_amount_cop WHERE tip_amount_cop != 0 AND tip_amount = 0;
          ALTER TABLE transaction_logs DROP COLUMN tip_amount_cop;
        END IF;
      END $$;
    `);

    logger.info("Startup migrations complete.");
  } finally {
    client.release();
  }
}

function startSessionCleanupJob(): void {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const runCleanup = async () => {
    try {
      const result = await db
        .delete(sessionsTable)
        .where(lt(sessionsTable.expire, new Date()));
      logger.info({ deleted: (result as unknown as { rowCount?: number }).rowCount ?? 0 }, "Session cleanup: expired sessions removed");
    } catch (err) {
      logger.error({ err }, "Session cleanup job failed");
    }
  };
  // Run once shortly after startup, then every hour
  setTimeout(runCleanup, 5000);
  setInterval(runCleanup, ONE_HOUR_MS);
  logger.info("Session cleanup job scheduled (every 1 hour)");
}

runStartupMigrations()
  .then(() => {
    startSessionCleanupJob();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed — aborting");
    process.exit(1);
  });

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
      ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS tip_amount_cop
        integer NOT NULL DEFAULT 0;

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

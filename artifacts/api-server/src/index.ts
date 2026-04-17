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

      -- ── events: ticketing columns ─────────────────────────────────────────
      ALTER TABLE events ADD COLUMN IF NOT EXISTS ticketing_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS nfc_bracelets_enabled boolean NOT NULL DEFAULT true;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS sales_channel varchar(20) NOT NULL DEFAULT 'both';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url varchar(1000);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS flyer_image_url varchar(1000);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS long_description text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS category varchar(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS min_age integer;

      -- ── Ticketing enum types (idempotent) ────────────────────────────────
      DO $$ BEGIN
        CREATE TYPE sales_channel AS ENUM ('online', 'door', 'both');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE ticket_order_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired', 'refunded');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE ticket_status AS ENUM ('valid', 'used', 'cancelled', 'transferred', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE unit_status AS ENUM ('available', 'reserved', 'sold');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE guest_list_status AS ENUM ('active', 'closed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── event_days table ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS event_days (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id      varchar NOT NULL REFERENCES events(id),
        date          date NOT NULL,
        label         varchar(255),
        doors_open_at timestamptz,
        doors_close_at timestamptz,
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_event_days_event_id ON event_days (event_id);

      -- ── venues table ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS venues (
        id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id            varchar NOT NULL REFERENCES events(id),
        name                varchar(255) NOT NULL,
        address             varchar(500),
        city                varchar(255),
        latitude            numeric(10,7),
        longitude           numeric(10,7),
        floorplan_image_url text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_venues_event_id ON venues (event_id);

      -- ── venue_sections table ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS venue_sections (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        venue_id      varchar NOT NULL REFERENCES venues(id),
        name          varchar(255) NOT NULL,
        capacity      integer,
        total_tickets integer NOT NULL DEFAULT 0,
        sold_tickets  integer NOT NULL DEFAULT 0,
        color_hex     varchar(9) DEFAULT '#6366F1',
        svg_path_data text,
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_venue_sections_venue_id ON venue_sections (venue_id);
      DO $$ BEGIN
        ALTER TABLE venue_sections ADD CONSTRAINT venue_sections_sold_non_negative CHECK (sold_tickets >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── ticket_types table ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ticket_types (
        id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id          varchar NOT NULL REFERENCES events(id),
        section_id        varchar REFERENCES venue_sections(id),
        name              varchar(255) NOT NULL,
        description       text,
        price             integer NOT NULL,
        service_fee       integer NOT NULL DEFAULT 0,
        quantity          integer NOT NULL,
        sold_count        integer NOT NULL DEFAULT 0,
        sale_start        timestamptz,
        sale_end          timestamptz,
        is_active         boolean NOT NULL DEFAULT true,
        is_numbered_units boolean NOT NULL DEFAULT false,
        unit_label        varchar(100),
        tickets_per_unit  integer,
        valid_event_day_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON ticket_types (event_id);
      DO $$ BEGIN
        ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_sold_non_negative CHECK (sold_count >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── ticket_orders table ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ticket_orders (
        id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id              varchar NOT NULL REFERENCES events(id),
        buyer_user_id         varchar REFERENCES users(id),
        buyer_email           varchar(320) NOT NULL,
        buyer_name            varchar(255),
        total_amount          integer NOT NULL,
        ticket_count          integer NOT NULL,
        payment_status        ticket_order_status NOT NULL DEFAULT 'pending',
        payment_method        varchar(50),
        wompi_transaction_id  varchar,
        wompi_reference       varchar,
        expires_at            timestamptz,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_orders_event_id ON ticket_orders (event_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_orders_buyer_user_id ON ticket_orders (buyer_user_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_orders_wompi_transaction_id ON ticket_orders (wompi_transaction_id);

      -- ── ticket_type_units table ──────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ticket_type_units (
        id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_type_id varchar NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
        unit_number    integer NOT NULL,
        unit_label     varchar(255) NOT NULL,
        status         unit_status NOT NULL DEFAULT 'available',
        order_id       varchar REFERENCES ticket_orders(id),
        created_at     timestamptz NOT NULL DEFAULT now(),
        UNIQUE (ticket_type_id, unit_number)
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_type_units_ticket_type_id ON ticket_type_units (ticket_type_id);

      -- ── tickets table ────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS tickets (
        id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id        varchar NOT NULL REFERENCES ticket_orders(id),
        ticket_type_id  varchar REFERENCES ticket_types(id),
        event_id        varchar NOT NULL REFERENCES events(id),
        unit_id         varchar REFERENCES ticket_type_units(id),
        attendee_name   varchar(255) NOT NULL,
        attendee_email  varchar(320) NOT NULL,
        attendee_phone  varchar(30),
        attendee_user_id varchar REFERENCES users(id),
        qr_code_token   varchar(512) UNIQUE,
        status          ticket_status NOT NULL DEFAULT 'valid',
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets (order_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets (event_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_attendee_email ON tickets (attendee_email);
      CREATE INDEX IF NOT EXISTS idx_tickets_attendee_user_id ON tickets (attendee_user_id);

      -- ── ticket_pricing_stages table ──────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ticket_pricing_stages (
        id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_type_id varchar NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
        name           varchar(255) NOT NULL,
        price          integer NOT NULL,
        starts_at      timestamptz NOT NULL,
        ends_at        timestamptz NOT NULL,
        display_order  integer NOT NULL DEFAULT 0,
        created_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_pricing_stages_ticket_type_id ON ticket_pricing_stages (ticket_type_id);

      -- ── guest_lists table ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS guest_lists (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id      varchar NOT NULL REFERENCES events(id),
        name          varchar(255) NOT NULL,
        slug          varchar(100) NOT NULL UNIQUE,
        max_guests    integer NOT NULL,
        current_count integer NOT NULL DEFAULT 0,
        is_public     boolean NOT NULL DEFAULT false,
        status        guest_list_status NOT NULL DEFAULT 'active',
        expires_at    timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_guest_lists_event_id ON guest_lists (event_id);
      CREATE INDEX IF NOT EXISTS idx_guest_lists_slug ON guest_lists (slug);
      DO $$ BEGIN
        ALTER TABLE guest_lists ADD CONSTRAINT guest_lists_count_non_negative CHECK (current_count >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- ── guest_list_entries table ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS guest_list_entries (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        guest_list_id varchar NOT NULL REFERENCES guest_lists(id),
        name          varchar(255) NOT NULL,
        email         varchar(320) NOT NULL,
        phone         varchar(30),
        ticket_id     varchar REFERENCES tickets(id),
        order_id      varchar REFERENCES ticket_orders(id),
        created_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (guest_list_id, email)
      );
      CREATE INDEX IF NOT EXISTS idx_guest_list_entries_guest_list_id ON guest_list_entries (guest_list_id);
      CREATE INDEX IF NOT EXISTS idx_guest_list_entries_email ON guest_list_entries (email);

      -- ── ticket_checkins table ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ticket_checkins (
        id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id             varchar(255) NOT NULL,
        event_id              varchar NOT NULL REFERENCES events(id),
        event_day_index       integer NOT NULL,
        attendee_user_id      varchar NOT NULL REFERENCES users(id),
        bracelet_id           varchar REFERENCES bracelets(id),
        bracelet_nfc_uid      varchar(64),
        access_zone_id        varchar,
        section               varchar(255),
        ticket_type           varchar(100),
        checked_in_by_user_id varchar NOT NULL REFERENCES users(id),
        checked_in_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ticket_checkins_event_ticket_day_unique UNIQUE (event_id, ticket_id, event_day_index)
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_checkins_ticket_id ON ticket_checkins (ticket_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_checkins_event_id ON ticket_checkins (event_id);

      -- ── Performance indexes for transaction queries ───────────────────────
      CREATE INDEX IF NOT EXISTS idx_transaction_logs_created_at ON transaction_logs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transaction_logs_event_id ON transaction_logs (event_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_line_items_transaction_log_id ON transaction_line_items (transaction_log_id);
      CREATE INDEX IF NOT EXISTS idx_top_ups_created_at ON top_ups (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_top_ups_bracelet_uid ON top_ups (bracelet_uid);

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

      -- ── ticket_type_units: map position columns ───────────────────────────
      ALTER TABLE ticket_type_units ADD COLUMN IF NOT EXISTS map_x NUMERIC(6,2);
      ALTER TABLE ticket_type_units ADD COLUMN IF NOT EXISTS map_y NUMERIC(6,2);

      -- ── event_reminder_schedules table ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS event_reminder_schedules (
        id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id            varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        days_before         integer NOT NULL,
        template_mapping_id varchar REFERENCES whatsapp_trigger_mappings(id) ON DELETE SET NULL,
        enabled             boolean NOT NULL DEFAULT true,
        sent_at             timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        UNIQUE (event_id, days_before)
      );
      CREATE INDEX IF NOT EXISTS idx_event_reminder_schedules_event_id ON event_reminder_schedules (event_id);

      -- ── attestation_tokens: persisted device attestation cache ──────────────
      CREATE TABLE IF NOT EXISTS attestation_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attestation_tokens_expires_at ON attestation_tokens (expires_at);

      -- ── access_zones: source_section_id for venue map sync ─────────────────
      ALTER TABLE access_zones ADD COLUMN IF NOT EXISTS source_section_id VARCHAR;
      DO $$ BEGIN
        ALTER TABLE access_zones
          ADD CONSTRAINT access_zones_source_section_id_fk
          FOREIGN KEY (source_section_id) REFERENCES venue_sections(id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_access_zones_event_source_section
        ON access_zones (event_id, source_section_id)
        WHERE source_section_id IS NOT NULL;
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

function startAttestationCleanupJob(): void {
  const runCleanup = async () => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM attestation_tokens WHERE expires_at <= NOW()`);
      if ((rowCount ?? 0) > 0) {
        logger.info({ deleted: rowCount }, "Attestation cleanup: expired tokens removed");
      }
    } catch (err) {
      logger.error({ err }, "Attestation cleanup job failed");
    }
  };
  setTimeout(runCleanup, 10_000);
  setInterval(runCleanup, 60 * 60 * 1000);
  logger.info("Attestation cleanup job scheduled (every 1 hour)");
}

function startEventReminderJob(): void {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  const runReminders = async () => {
    const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY;
    const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME;
    const GUPSHUP_SOURCE = process.env.GUPSHUP_SOURCE_NUMBER;
    if (!GUPSHUP_API_KEY || !GUPSHUP_APP_NAME || !GUPSHUP_SOURCE) return;

    try {
      // Find schedules due today: event starts in exactly days_before days, not yet sent
      const { rows: dueSchedules } = await pool.query<{
        id: string;
        event_id: string;
        days_before: number;
        template_mapping_id: string | null;
        event_name: string;
        event_starts_at: string;
        venue_address: string | null;
      }>(`
        SELECT s.id, s.event_id, s.days_before, s.template_mapping_id,
               e.name AS event_name, e.starts_at AS event_starts_at, e.venue_address
        FROM event_reminder_schedules s
        JOIN events e ON e.id = s.event_id
        WHERE s.enabled = true
          AND s.sent_at IS NULL
          AND (e.starts_at AT TIME ZONE 'America/Bogota')::date
              = (NOW() AT TIME ZONE 'America/Bogota')::date + s.days_before * INTERVAL '1 day'
      `);

      if (dueSchedules.length === 0) return;
      logger.info({ count: dueSchedules.length }, "Event reminder job: schedules due today");

      for (const schedule of dueSchedules) {
        try {
          // Resolve template mapping
          let gupshupTemplateId: string | null = null;
          let paramMappings: Array<{ position: number; field: string }> = [];

          if (schedule.template_mapping_id) {
            const { rows: mappingRows } = await pool.query<{
              gupshup_template_id: string;
              parameter_mappings: Array<{ position: number; field: string }>;
            }>(`
              SELECT t.gupshup_template_id, m.parameter_mappings
              FROM whatsapp_trigger_mappings m
              JOIN whatsapp_templates t ON t.id = m.template_id
              WHERE m.id = $1 AND m.active = true AND t.status = 'active'
            `, [schedule.template_mapping_id]);
            if (mappingRows[0]) {
              gupshupTemplateId = mappingRows[0].gupshup_template_id;
              paramMappings = mappingRows[0].parameter_mappings ?? [];
            }
          }

          // Get all valid ticket holders for this event
          const { rows: attendees } = await pool.query<{
            attendee_name: string;
            attendee_phone: string;
            ticket_id: string;
            order_id: string;
          }>(`
            SELECT t.attendee_name, t.attendee_phone, t.id AS ticket_id, t.order_id
            FROM tickets t
            JOIN ticket_orders o ON o.id = t.order_id
            WHERE t.event_id = $1
              AND t.status = 'valid'
              AND o.payment_status = 'confirmed'
              AND t.attendee_phone IS NOT NULL
              AND t.attendee_phone <> ''
          `, [schedule.event_id]);

          const eventDate = new Date(schedule.event_starts_at).toLocaleDateString("es-CO", {
            weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota",
          });

          let sent = 0;
          let failed = 0;

          for (const attendee of attendees) {
            if (!gupshupTemplateId) continue;

            // Build params from mapping fields
            const daysRemainingText = schedule.days_before === 0
              ? "HOY"
              : `en ${schedule.days_before} día${schedule.days_before > 1 ? "s" : ""}`;
            const context: Record<string, string> = {
              attendeeName: attendee.attendee_name,
              eventName: schedule.event_name,
              venueName: schedule.venue_address ?? "",
              eventDate,
              daysRemainingText,
            };
            const maxPos = paramMappings.length > 0
              ? Math.max(...paramMappings.map((m) => m.position))
              : 0;
            const params: string[] = Array(maxPos).fill("");
            for (const mapping of paramMappings) {
              params[mapping.position - 1] = context[mapping.field] ?? "";
            }

            // Normalize phone
            let phone = attendee.attendee_phone.replace(/[\s\-()]/g, "");
            if (/^\d{10}$/.test(phone)) phone = `57${phone}`;
            phone = phone.replace(/^\+/, "");

            // Log the message attempt
            const { rows: logRows } = await pool.query<{ id: string }>(`
              INSERT INTO whatsapp_message_log (destination, message_type, template_id, trigger_type, status, payload, event_id, ticket_id, order_id, attendee_name)
              VALUES ($1, 'template', $2, 'event_reminder', 'pending', $3, $4, $5, $6, $7)
              RETURNING id
            `, [
              phone,
              schedule.template_mapping_id,
              JSON.stringify({ templateId: gupshupTemplateId, params }),
              schedule.event_id,
              attendee.ticket_id,
              attendee.order_id,
              attendee.attendee_name,
            ]);
            const logId = logRows[0]?.id;

            // Send via Gupshup
            const formBody = new URLSearchParams();
            formBody.append("channel", "whatsapp");
            formBody.append("source", GUPSHUP_SOURCE);
            formBody.append("destination", phone);
            formBody.append("src.name", GUPSHUP_APP_NAME);
            formBody.append("template", JSON.stringify({ id: gupshupTemplateId, params }));

            const gupshupRes = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GUPSHUP_API_KEY },
              body: formBody.toString(),
            });
            const responseText = await gupshupRes.text();
            let parsed: Record<string, unknown> = {};
            try { parsed = JSON.parse(responseText); } catch {}
            const success = gupshupRes.ok && parsed.status !== "error";

            if (logId) {
              await pool.query(`
                UPDATE whatsapp_message_log
                SET status = $1, error_message = $2, gupshup_message_id = $3, updated_at = now()
                WHERE id = $4
              `, [
                success ? "sent" : "failed",
                success ? null : (parsed.message as string || responseText),
                success ? (parsed.messageId as string || null) : null,
                logId,
              ]);
            }

            if (success) sent++; else failed++;
          }

          // Mark schedule as sent
          await pool.query(`UPDATE event_reminder_schedules SET sent_at = now(), updated_at = now() WHERE id = $1`, [schedule.id]);
          logger.info({ scheduleId: schedule.id, eventId: schedule.event_id, daysBefore: schedule.days_before, sent, failed }, "Event reminder batch complete");
        } catch (err) {
          logger.error({ err, scheduleId: schedule.id }, "Event reminder schedule failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "Event reminder job failed");
    }
  };

  setTimeout(runReminders, 15000);
  setInterval(runReminders, SIX_HOURS_MS);
  logger.info("Event reminder job scheduled (every 6 hours)");
}

runStartupMigrations()
  .then(() => {
    startSessionCleanupJob();
    startAttestationCleanupJob();
    startEventReminderJob();
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

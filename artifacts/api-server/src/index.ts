import { readFileSync } from "fs";
import { resolve } from "path";
import { pool } from "@workspace/db";
import { db, sessionsTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import app from "./app";
import { logger } from "./lib/logger";
import { purgeOrphanedLoadTestBracelets } from "./routes/loadTest";
import { initSyncPool, seedEventData, startBalanceSyncJob } from "./lib/railwaySync";

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

    // ── Bootstrap fresh database ───────────────────────────────────────────────
    // On a brand-new install (Docker or otherwise) the base schema created by
    // drizzle-kit doesn't exist yet. Detect this by checking for the `users`
    // table and, if absent, apply the four Drizzle SQL migration files in order.
    // The files live at ../../lib/db/drizzle/ relative to the api-server CWD.
    // On subsequent restarts the check is a single fast query — no extra cost.
    {
      const { rows: [{ schema_exists }] } = await client.query<{ schema_exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'users'
        ) AS schema_exists`
      );

      if (!schema_exists) {
        logger.info("Fresh database detected — applying base Drizzle schema migrations…");
        const drizzleDir = resolve(process.cwd(), "../../lib/db/drizzle");
        const baseFiles = [
          "0000_abnormal_barracuda.sql",
          "0001_access_zones_constraints.sql",
          "0002_add_manual_adjustment_and_check_constraints.sql",
          "0003_add_event_timezone.sql",
        ];
        for (const filename of baseFiles) {
          const sql = readFileSync(resolve(drizzleDir, filename), "utf8");
          // Drizzle uses `--> statement-breakpoint` as statement separators.
          // They start with `--` so psql treats them as comments; here we split
          // on them to feed each statement to the driver individually.
          const statements = sql
            .split(/--> statement-breakpoint/)
            .map((s) => s.trim())
            .filter(Boolean);
          for (const stmt of statements) {
            await client.query(stmt);
          }
          logger.info({ file: filename }, "Base migration applied");
        }
        logger.info("Base schema bootstrap complete.");
      }
    }

    // Must run outside transaction block (ALTER TYPE ADD VALUE restriction).
    // Guard against fresh DBs: skip ALTER if the base types don't exist yet
    // (base schema is created by the Drizzle initial migration).
    const { rows: existingTypeRows } = await client.query<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typname IN ('user_role', 'stock_movement_type')`
    );
    const existingTypes = new Set(existingTypeRows.map((r: { typname: string }) => r.typname));
    if (existingTypes.has('user_role')) {
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gate'`);
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'box_office'`);
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ticketing_auditor'`);
    }
    if (existingTypes.has('stock_movement_type')) {
      await client.query(`ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'manual_adjustment'`);
    }

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
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS access_zone_ids        text[] NOT NULL DEFAULT '{}';
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS max_offline_spend       integer;
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS pending_top_up_amount   integer NOT NULL DEFAULT 0;
      ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS registered_by_user_id  varchar REFERENCES users(id);

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
      CREATE TABLE IF NOT EXISTS bracelet_transfer_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        bracelet_uid varchar(64) NOT NULL,
        from_user_id varchar NOT NULL REFERENCES users(id),
        balance integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // ── WhatsApp tables (not in Drizzle 0000-0003, referenced by event_reminder_schedules FK) ──
    await client.query(`
      DO $$ BEGIN CREATE TYPE whatsapp_template_category AS ENUM ('UTILITY','MARKETING','AUTHENTICATION');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE whatsapp_template_status AS ENUM ('active','inactive','pending_approval');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE whatsapp_trigger_type AS ENUM ('ticket_purchased','otp_verification','event_reminder','ticket_refund','welcome_message','ticket_transfer','custom');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE whatsapp_message_status AS ENUM ('sent','failed','pending');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE whatsapp_message_type AS ENUM ('template','text','document','image');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE pending_wa_doc_status AS ENUM ('pending','sent','expired','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name                varchar(255) NOT NULL,
        gupshup_template_id varchar(255) NOT NULL,
        description         text,
        language            varchar(10) NOT NULL DEFAULT 'es',
        category            whatsapp_template_category NOT NULL DEFAULT 'UTILITY',
        status              whatsapp_template_status NOT NULL DEFAULT 'active',
        parameters          jsonb NOT NULL DEFAULT '[]'::jsonb,
        buttons             jsonb NOT NULL DEFAULT '[]'::jsonb,
        body_preview        text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_trigger_mappings (
        id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger_type        whatsapp_trigger_type NOT NULL,
        template_id         varchar NOT NULL REFERENCES whatsapp_templates(id) ON DELETE CASCADE,
        event_id            varchar,
        active              boolean NOT NULL DEFAULT true,
        priority            integer NOT NULL DEFAULT 0,
        parameter_mappings  jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_message_log (
        id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        destination         varchar(30) NOT NULL,
        message_type        whatsapp_message_type NOT NULL,
        template_id         varchar,
        template_name       varchar(255),
        trigger_type        varchar(50),
        status              whatsapp_message_status NOT NULL DEFAULT 'pending',
        error_message       text,
        payload             jsonb,
        order_id            varchar,
        ticket_id           varchar,
        event_id            varchar,
        attendee_name       varchar(255),
        gupshup_message_id  varchar(255),
        retry_count         integer NOT NULL DEFAULT 0,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS pending_whatsapp_documents (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        phone         varchar(30) NOT NULL,
        order_id      varchar NOT NULL,
        event_name    varchar(255) NOT NULL,
        attendee_name varchar(255) NOT NULL,
        ticket_count  integer NOT NULL DEFAULT 1,
        pdf_url       text NOT NULL,
        filename      varchar(255) NOT NULL,
        status        pending_wa_doc_status NOT NULL DEFAULT 'pending',
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
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

      -- ── event_reminder_schedules: allow global (event_id nullable) + direct template ref ──
      ALTER TABLE event_reminder_schedules ALTER COLUMN event_id DROP NOT NULL;
      ALTER TABLE event_reminder_schedules ADD COLUMN IF NOT EXISTS template_id varchar REFERENCES whatsapp_templates(id) ON DELETE SET NULL;
      ALTER TABLE event_reminder_schedules ADD COLUMN IF NOT EXISTS param_mappings jsonb;
      -- Deduplicate global schedules before creating the transient unique index
      DELETE FROM event_reminder_schedules
      WHERE event_id IS NULL
        AND id NOT IN (
          SELECT DISTINCT ON (days_before) id
          FROM event_reminder_schedules
          WHERE event_id IS NULL
          ORDER BY days_before, id
        );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_schedules_global_days ON event_reminder_schedules (days_before) WHERE event_id IS NULL;

      -- ── Allow multiple reminders per day (drop unique constraints) ────────────
      ALTER TABLE event_reminder_schedules DROP CONSTRAINT IF EXISTS event_reminder_schedules_event_id_days_before_key;
      DROP INDEX IF EXISTS idx_reminder_schedules_global_days;

      -- ── event_reminder_runs: per-event tracking for global schedules ─────────
      CREATE TABLE IF NOT EXISTS event_reminder_runs (
        id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id varchar NOT NULL REFERENCES event_reminder_schedules(id) ON DELETE CASCADE,
        event_id    varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        sent_at     timestamptz NOT NULL DEFAULT now(),
        UNIQUE (schedule_id, event_id)
      );

      -- ── attestation_tokens: persisted device attestation cache ──────────────
      CREATE TABLE IF NOT EXISTS attestation_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attestation_tokens_expires_at ON attestation_tokens (expires_at);

      -- ── device_sync_issues: permanently-blocked POS offline queue items ──────
      CREATE TABLE IF NOT EXISTS device_sync_issues (
        id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        local_id              varchar NOT NULL,
        user_id               varchar NOT NULL REFERENCES users(id),
        nfc_uid               varchar(64) NOT NULL,
        type                  varchar(10) NOT NULL,
        amount                integer NOT NULL,
        fail_reason           varchar,
        fail_count            integer NOT NULL DEFAULT 1,
        occurred_at           timestamptz,
        reported_at           timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        dismissed_at          timestamptz,
        dismissed_by_user_id  varchar REFERENCES users(id),
        UNIQUE (user_id, local_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_sync_issues_user_id ON device_sync_issues (user_id);
      CREATE INDEX IF NOT EXISTS idx_device_sync_issues_dismissed ON device_sync_issues (dismissed_at) WHERE dismissed_at IS NULL;

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

      -- ── load_test_runs: pre-event simulator runs ──────────────────────────────
      CREATE TABLE IF NOT EXISTS load_test_runs (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id      varchar REFERENCES events(id) ON DELETE SET NULL,
        test_type     varchar NOT NULL,
        config        jsonb NOT NULL DEFAULT '{}',
        status        varchar NOT NULL DEFAULT 'pending',
        score         integer,
        results       jsonb,
        sentry_trace_id varchar,
        started_at    timestamptz,
        completed_at  timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_load_test_runs_event ON load_test_runs (event_id);
      CREATE INDEX IF NOT EXISTS idx_load_test_runs_created ON load_test_runs (created_at DESC);

      -- ── device_test_runs: real-device load test orchestration ─────────────────
      CREATE TABLE IF NOT EXISTS device_test_runs (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id      varchar REFERENCES events(id) ON DELETE SET NULL,
        status        varchar NOT NULL DEFAULT 'pending',
        config        jsonb NOT NULL DEFAULT '{}',
        created_at    timestamptz NOT NULL DEFAULT now(),
        completed_at  timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_device_test_runs_event ON device_test_runs (event_id);

      -- ── product_categories: managed category list per event ───────────────────
      CREATE TABLE IF NOT EXISTS product_categories (
        id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id   varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name       varchar(100) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (event_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_product_categories_event_id ON product_categories (event_id);

      CREATE TABLE IF NOT EXISTS device_test_results (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id        varchar REFERENCES device_test_runs(id) ON DELETE CASCADE,
        user_id       varchar,
        device_name   varchar,
        latencies     jsonb NOT NULL DEFAULT '[]',
        success_count int  NOT NULL DEFAULT 0,
        error_count   int  NOT NULL DEFAULT 0,
        p50           float,
        p95           float,
        completed_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (run_id, user_id)
      );
    `);

    // ── Payment methods columns ────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS bank_payment_methods jsonb NOT NULL DEFAULT '["cash","card_external","nequi_transfer","bancolombia_transfer","other"]'::jsonb,
        ADD COLUMN IF NOT EXISTS box_office_payment_methods jsonb NOT NULL DEFAULT '["gate_cash","gate_transfer","gate_card","gate_nequi"]'::jsonb,
        ADD COLUMN IF NOT EXISTS bank_min_topup integer NOT NULL DEFAULT 0;
    `);

    // ── WhatsApp template CTA buttons ────────────────────────────────────────
    await client.query(`
      ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);

    // ── Sync allowed_nfc_types from nfc_chip_type for legacy events ───────────
    // When allowed_nfc_types column was added it defaulted to ["ntag_21x"].
    // Events that had nfc_chip_type already set to a different value ended up
    // with an inconsistent allowed_nfc_types. Fix them once, idempotently.
    await client.query(`
      UPDATE events
      SET allowed_nfc_types = jsonb_build_array(nfc_chip_type::text)
      WHERE nfc_chip_type != 'ntag_21x'
        AND allowed_nfc_types = '["ntag_21x"]'::jsonb
    `);

    // ── Tombstone table for hard-deleted bracelets ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS deleted_bracelet_uids (
        nfc_uid varchar(64) PRIMARY KEY,
        deleted_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // ── Ticketing auditor audit tables ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS auditor_login_activity (
        id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logged_in_at timestamptz NOT NULL DEFAULT now(),
        ip_address   varchar(45)
      );
      CREATE INDEX IF NOT EXISTS idx_auditor_login_activity_user_id
        ON auditor_login_activity (user_id);
      CREATE INDEX IF NOT EXISTS idx_auditor_login_activity_logged_in_at
        ON auditor_login_activity (logged_in_at);

      CREATE TABLE IF NOT EXISTS auditor_csv_downloads (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        downloaded_at timestamptz NOT NULL DEFAULT now(),
        filters       jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_auditor_csv_downloads_user_id
        ON auditor_csv_downloads (user_id);
      CREATE INDEX IF NOT EXISTS idx_auditor_csv_downloads_downloaded_at
        ON auditor_csv_downloads (downloaded_at);
    `);

    // ── ads: promotional banners for the ticket storefront ───────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        title         varchar(255) NOT NULL,
        image_url     text NOT NULL,
        link_url      text,
        is_active     boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0,
        starts_at     timestamptz,
        ends_at       timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
    `);

    // ── local_server_heartbeats: health pings from on-site local servers ─────
    await client.query(`
      CREATE TABLE IF NOT EXISTS local_server_heartbeats (
        server_id            TEXT PRIMARY KEY,
        cpu_load_percent     INTEGER,
        memory_used_mb       INTEGER,
        memory_total_mb      INTEGER,
        process_uptime_s     INTEGER,
        events_loaded        INTEGER,
        bracelets_loaded     INTEGER,
        merchants_loaded     INTEGER,
        users_loaded         INTEGER,
        railway_latency_ms   INTEGER,
        railway_connected    BOOLEAN,
        last_seed_at         TIMESTAMPTZ,
        last_balance_sync_at TIMESTAMPTZ,
        reported_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // ── Bracelet activation fee ───────────────────────────────────────────────
    await client.query(`
      ALTER TABLE bracelets
        ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
      ALTER TABLE top_ups
        ADD COLUMN IF NOT EXISTS activation_fee_amount INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS bracelet_activation_fee INTEGER NOT NULL DEFAULT 3000;
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
    const WATI_API_KEY = process.env.WATI_API_KEY;
    const WATI_API_URL = process.env.WATI_API_URL?.replace(/\/$/, "");
    if (!WATI_API_KEY || !WATI_API_URL) return;

    try {
      type DueSchedule = {
        id: string;
        event_id: string;
        days_before: number;
        template_mapping_id: string | null;
        template_id: string | null;
        param_mappings: Array<{ position: number; field: string }> | null;
        event_name: string;
        event_starts_at: string;
        venue_address: string | null;
        latitude: string | null;
        longitude: string | null;
      };

      // Per-event schedules due today (not yet sent)
      const { rows: perEventSchedules } = await pool.query<DueSchedule>(`
        SELECT s.id, s.event_id, s.days_before, s.template_mapping_id, s.template_id, s.param_mappings,
               e.name AS event_name, e.starts_at AS event_starts_at, e.venue_address,
               e.latitude, e.longitude
        FROM event_reminder_schedules s
        JOIN events e ON e.id = s.event_id
        WHERE s.enabled = true
          AND s.sent_at IS NULL
          AND (e.starts_at AT TIME ZONE 'America/Bogota')::date
              = (NOW() AT TIME ZONE 'America/Bogota')::date + s.days_before * INTERVAL '1 day'
      `);

      // Global schedules (event_id IS NULL) matched against any event starting today
      const { rows: globalSchedules } = await pool.query<DueSchedule>(`
        SELECT s.id, s.days_before, s.template_mapping_id, s.template_id, s.param_mappings,
               e.id AS event_id, e.name AS event_name, e.starts_at AS event_starts_at, e.venue_address,
               e.latitude, e.longitude
        FROM event_reminder_schedules s
        CROSS JOIN events e
        WHERE s.event_id IS NULL AND s.enabled = true
          AND (e.starts_at AT TIME ZONE 'America/Bogota')::date
              = (NOW() AT TIME ZONE 'America/Bogota')::date + s.days_before * INTERVAL '1 day'
          AND NOT EXISTS (
            SELECT 1 FROM event_reminder_runs r WHERE r.schedule_id = s.id AND r.event_id = e.id
          )
      `);

      const dueSchedules = [...perEventSchedules, ...globalSchedules];
      if (dueSchedules.length === 0) return;
      logger.info({ count: dueSchedules.length }, "Event reminder job: schedules due today");

      for (const schedule of dueSchedules) {
        try {
          // Resolve template — gupshup_template_id column now stores the WATI template_name
          let watiTemplateName: string | null = null;
          let paramMappings: Array<{ position: number; field: string }> = [];

          if (schedule.template_id) {
            const { rows: tplRows } = await pool.query<{
              gupshup_template_id: string;
            }>(
              `SELECT gupshup_template_id FROM whatsapp_templates WHERE id = $1 AND status = 'active'`,
              [schedule.template_id],
            );
            if (tplRows[0]) {
              watiTemplateName = tplRows[0].gupshup_template_id;
              paramMappings = schedule.param_mappings ?? [];
            }
          } else if (schedule.template_mapping_id) {
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
              watiTemplateName = mappingRows[0].gupshup_template_id;
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
            if (!watiTemplateName) continue;

            const daysRemainingText = schedule.days_before === 0
              ? "HOY"
              : `en ${schedule.days_before} día${schedule.days_before > 1 ? "s" : ""}`;
            const venueMapUrl = schedule.latitude && schedule.longitude
              ? `https://maps.google.com/?q=${schedule.latitude},${schedule.longitude}`
              : schedule.venue_address
                ? `https://maps.google.com/?q=${encodeURIComponent(schedule.venue_address)}`
                : "";
            const context: Record<string, string> = {
              attendeeName: attendee.attendee_name,
              eventName: schedule.event_name,
              venueName: schedule.venue_address ?? "",
              venueAddress: schedule.venue_address ?? "",
              venueMapUrl,
              eventDate,
              daysRemainingText,
            };

            // Build positional WATI parameters
            const maxPos = paramMappings.length > 0 ? Math.max(...paramMappings.map((m) => m.position)) : 0;
            const paramValues: string[] = Array(maxPos).fill("");
            for (const mapping of paramMappings) {
              paramValues[mapping.position - 1] = context[mapping.field] ?? "";
            }
            const parameters = paramValues.map((value, i) => ({ name: String(i + 1), value }));

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
              JSON.stringify({ templateName: watiTemplateName, params: parameters }),
              schedule.event_id,
              attendee.ticket_id,
              attendee.order_id,
              attendee.attendee_name,
            ]);
            const logId = logRows[0]?.id;

            // Send via WATI
            const watiRes = await fetch(
              `${WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${phone}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${WATI_API_KEY}` },
                body: JSON.stringify({ template_name: watiTemplateName, broadcast_name: watiTemplateName, parameters }),
              },
            );
            const responseText = await watiRes.text();
            let parsed: Record<string, unknown> = {};
            try { parsed = JSON.parse(responseText); } catch {}
            const success = watiRes.ok && parsed.result !== false;

            if (logId) {
              await pool.query(`
                UPDATE whatsapp_message_log
                SET status = $1, error_message = $2, gupshup_message_id = $3, updated_at = now()
                WHERE id = $4
              `, [
                success ? "sent" : "failed",
                success ? null : ((parsed.info as string) || responseText),
                success ? ((parsed.id as string) || null) : null,
                logId,
              ]);
            }

            if (success) sent++; else failed++;
          }

          // Mark schedule as sent (per-event schedules use sent_at; global schedules use event_reminder_runs)
          if (schedule.event_id && !globalSchedules.find((g) => g.id === schedule.id)) {
            await pool.query(`UPDATE event_reminder_schedules SET sent_at = now(), updated_at = now() WHERE id = $1`, [schedule.id]);
          } else {
            await pool.query(
              `INSERT INTO event_reminder_runs (schedule_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [schedule.id, schedule.event_id],
            );
          }
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
  .then(async () => {
    startSessionCleanupJob();
    startAttestationCleanupJob();
    startEventReminderJob();
    purgeOrphanedLoadTestBracelets();
    if (process.env.RAILWAY_SYNC_URL) {
      await initSyncPool(process.env.RAILWAY_SYNC_URL);
      logger.info("Seeding event data from Railway before accepting connections…");
      await seedEventData();
      startBalanceSyncJob();
    }
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

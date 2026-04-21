import os from "os";
import pg from "pg";
import { pool } from "@workspace/db";
import { logger } from "./logger";

let syncPool: pg.Pool | null = null;

let lastTransactionSyncAt: Date = new Date(0);
let lastTopUpSyncAt: Date = new Date(0);

// Stats tracked for heartbeat
let lastSeedStats = { events: 0, bracelets: 0, merchants: 0, users: 0 };
let lastSeedAt: Date | null = null;
let lastBalanceSyncAt: Date | null = null;

// ── Schema-aware upsert helper ─────────────────────────────────────────────
// Queries the LOCAL table for its current column list, then SELECTs only
// those columns from Railway. This handles schema drift gracefully: if Railway
// has extra columns the local DB hasn't seen yet, they're simply skipped.

async function getLocalColumns(
  localClient: pg.PoolClient,
  table: string,
): Promise<{ name: string; isJsonb: boolean }[]> {
  const { rows } = await localClient.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => ({ name: r.column_name, isJsonb: r.data_type === "jsonb" }));
}

// Upsert an array of rows (from SELECT * on Railway) into the local table.
// conflictOn: comma-separated column name(s) that form the unique key.
// For tables with updated_at: Railway only wins if its row is newer than local,
// protecting locally-written data (bracelets, location_inventory) from being
// overwritten by a stale Railway value before the push cycle carries it back.
async function upsertRows(
  localClient: pg.PoolClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictOn: string,
): Promise<void> {
  if (rows.length === 0) return;

  const colMeta = await getLocalColumns(localClient, table);
  const jsonbCols = new Set(colMeta.filter((c) => c.isJsonb).map((c) => c.name));
  const hasUpdatedAt = colMeta.some((c) => c.name === "updated_at");
  const cols = Object.keys(rows[0]);
  const quotedCols = cols.map((c) => `"${c}"`).join(", ");
  const conflictCols = conflictOn.split(",").map((c) => c.trim());
  const nonConflict = cols.filter((c) => !conflictCols.includes(c));
  const updateSet =
    nonConflict.length > 0
      ? nonConflict.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")
      : null;

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const n = cols.length;
    const placeholders = batch
      .map((_, ri) => `(${cols.map((_, ci) => `$${ri * n + ci + 1}`).join(", ")})`)
      .join(", ");
    const params = batch.flatMap((row) => cols.map((c) => {
      const val = row[c] ?? null;
      // pg serializes JS arrays/objects as PostgreSQL array literals {…}.
      // For jsonb columns that needs to be a JSON string instead.
      // text[] columns receive JS arrays directly (pg handles the serialization).
      if (jsonbCols.has(c) && val !== null && typeof val === "object" && !(val instanceof Date)) {
        return JSON.stringify(val);
      }
      return val;
    }));
    let conflict: string;
    if (!updateSet) {
      conflict = `ON CONFLICT (${conflictOn}) DO NOTHING`;
    } else if (hasUpdatedAt) {
      // Only overwrite if Railway's version is newer — protects local writes
      // (balance decrements, stock changes) from being clobbered before they
      // are pushed back to Railway.
      conflict = `ON CONFLICT (${conflictOn}) DO UPDATE SET ${updateSet} WHERE "${table}".updated_at < EXCLUDED.updated_at`;
    } else {
      conflict = `ON CONFLICT (${conflictOn}) DO UPDATE SET ${updateSet}`;
    }
    await localClient.query(
      `INSERT INTO "${table}" (${quotedCols}) VALUES ${placeholders} ${conflict}`,
      params,
    );
  }
}

// Fetch rows from Railway using only the columns the local table knows about.
async function fetchFromRailway(
  localClient: pg.PoolClient,
  table: string,
  where: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const colMeta = await getLocalColumns(localClient, table);
  if (colMeta.length === 0) return [];
  const colList = colMeta.map((c) => `"${c.name}"`).join(", ");
  const { rows } = await syncPool!.query(
    `SELECT ${colList} FROM "${table}" ${where}`,
    params,
  );
  return rows as Record<string, unknown>[];
}

// ── Dynamic full-mirror seed: Railway → local ─────────────────────────────
// Syncs every table that exists on both Railway and local, automatically
// discovering new tables without code changes. Runs on startup and every
// 5 minutes. Order below is FK-safe (parents before children).

// Tables never pulled from Railway — either pushed BY local, ephemeral, or
// managed by other services.
const PULL_EXCLUDED: Set<string> = new Set([
  "sessions",
  "password_reset_tokens",
  "local_server_heartbeats",
  "transaction_logs",
  "transaction_line_items",
  "top_ups",
  "stock_movements",
  "restock_orders",
  "fraud_alerts",
  "merchant_payouts",
  "attendee_refund_requests",
  "wompi_payment_intents",
  "auditor_csv_downloads",
  "auditor_login_activity",
  "partial_sessions",
  "inventory_audits",
  "inventory_audit_items",
  "damaged_goods",
]);

// FK-safe seeding order. Tables not listed are synced last (caught by dynamic discovery).
const SEED_ORDER: string[] = [
  "promoter_companies",
  "exchange_rates",
  "users",
  "warehouses",
  "venues",
  "events",
  "merchants",
  "access_zones",
  "locations",
  "products",
  "product_categories",
  "user_location_assignments",
  "location_inventory",
  "warehouse_inventory",
  "venue_sections",
  "access_upgrades",
  "guest_lists",
  "event_days",
  "ticket_types",
  "bracelets",
  "deleted_bracelet_uids",
  "push_tokens",
  "guest_list_entries",
  "tickets",
  "whatsapp_templates",
  "whatsapp_trigger_mappings",
  "whatsapp_message_log",
  "pending_whatsapp_documents",
  "bracelet_transfer_logs",
  "event_reminder_schedules",
];

async function getPublicTables(client: pg.Pool | pg.PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function getPrimaryKey(localClient: pg.PoolClient, table: string): Promise<string | null> {
  const { rows } = await localClient.query<{ pk: string }>(
    `SELECT string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS pk
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     GROUP BY tc.table_name`,
    [table],
  );
  return rows[0]?.pk ?? null;
}

async function tableHasColumn(localClient: pg.PoolClient, table: string, col: string): Promise<boolean> {
  const cols = await getLocalColumns(localClient, table);
  return cols.some((c) => c.name === col);
}

function makeInParam(ids: string[], offset = 0): string {
  return `(${ids.map((_, i) => `$${i + 1 + offset}`).join(", ")})`;
}

async function seedEventData(): Promise<void> {
  if (!syncPool) return;
  const localClient = await pool.connect();
  try {
    // Resolve active event IDs for scoping large tables
    const { rows: eventRows } = await syncPool.query<{ id: string }>(
      `SELECT id FROM events WHERE active = true OR ends_at > now() - interval '2 days'`,
    );
    const activeEventIds = eventRows.map((r) => r.id);

    if (activeEventIds.length === 0) {
      logger.info("Railway sync: no active events on Railway — skipping seed");
      return;
    }

    // Discover tables present on both Railway and local, minus exclusions
    const [railwayTables, localTables] = await Promise.all([
      getPublicTables(syncPool),
      getPublicTables(localClient),
    ]);
    const localSet = new Set(localTables);
    const eligible = railwayTables.filter((t) => localSet.has(t) && !PULL_EXCLUDED.has(t));

    // Sort by SEED_ORDER then any remaining tables at end
    const orderedTables = [
      ...SEED_ORDER.filter((t) => eligible.includes(t)),
      ...eligible.filter((t) => !SEED_ORDER.includes(t)),
    ];

    const stats: Record<string, number> = {};

    for (const table of orderedTables) {
      try {
        const pk = await getPrimaryKey(localClient, table);
        if (!pk) continue; // no PK — can't upsert safely

        const hasEventId = await tableHasColumn(localClient, table, "event_id");

        let where = "";
        let params: unknown[] = [];

        if (hasEventId && activeEventIds.length > 0) {
          // Scope to active events (include rows with null event_id for global rows)
          where = `WHERE event_id IN ${makeInParam(activeEventIds)} OR event_id IS NULL`;
          params = activeEventIds;
        } else if (table === "users") {
          // Never pull attendees — they're managed by the attendee-api
          where = `WHERE role != 'attendee'`;
        }

        const rows = await fetchFromRailway(localClient, table, where, params);
        if (rows.length > 0) {
          await upsertRows(localClient, table, rows, pk);
        }
        stats[table] = rows.length;
      } catch (err) {
        logger.warn({ err, table }, "Railway sync: skipped table during seed");
      }
    }

    lastSeedStats = {
      events: activeEventIds.length,
      merchants: stats["merchants"] ?? 0,
      bracelets: stats["bracelets"] ?? 0,
      users: stats["users"] ?? 0,
    };
    lastSeedAt = new Date();

    const totalRows = Object.values(stats).reduce((a, b) => a + b, 0);
    logger.info(
      { tables: orderedTables.length, totalRows, ...stats },
      "Railway sync: full mirror seed complete",
    );
  } catch (err) {
    logger.error({ err }, "Railway sync: seed failed");
  } finally {
    localClient.release();
  }
}

// ── Railway → local (balance + NFC state) ─────────────────────────────────
// Applies Railway's bracelet state to local when Railway is newer.
// Runs every 2 min to keep balances/counters current between seeds.
async function pullRailwayBalances(): Promise<void> {
  if (!syncPool) return;
  try {
    const { rows } = await syncPool.query<{
      nfc_uid: string;
      last_known_balance: number;
      last_counter: number;
      pending_top_up_amount: number;
      event_id: string;
      updated_at: Date;
    }>(`
      SELECT nfc_uid, last_known_balance, last_counter,
             pending_top_up_amount, event_id, updated_at
      FROM bracelets
    `);
    if (rows.length === 0) return;

    const client = await pool.connect();
    try {
      let updated = 0;
      for (const row of rows) {
        const result = await client.query(
          `UPDATE bracelets
           SET last_known_balance = $1, last_counter = $2,
               pending_top_up_amount = $3, updated_at = $4
           WHERE nfc_uid = $5 AND event_id = $6 AND updated_at < $4`,
          [row.last_known_balance, row.last_counter,
           row.pending_top_up_amount, row.updated_at,
           row.nfc_uid, row.event_id],
        );
        if (result.rowCount && result.rowCount > 0) updated++;
      }
      if (updated > 0) logger.info({ updated }, "Railway sync: pulled balances from cloud");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Railway sync: pull balances failed");
  }
}

// ── Local → Railway (balance + NFC state) ─────────────────────────────────
// Pushes local bracelet changes (sales, top-ups) back to Railway.
async function pushLocalBalances(): Promise<void> {
  if (!syncPool) return;
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{
        nfc_uid: string;
        last_known_balance: number;
        last_counter: number;
        pending_top_up_amount: number;
        event_id: string;
        updated_at: Date;
      }>(`
        SELECT nfc_uid, last_known_balance, last_counter,
               pending_top_up_amount, event_id, updated_at
        FROM bracelets
      `);
      if (rows.length === 0) return;

      let pushed = 0;
      for (const row of rows) {
        const result = await syncPool!.query(
          `UPDATE bracelets
           SET last_known_balance = $1, last_counter = $2,
               pending_top_up_amount = $3, updated_at = $4
           WHERE nfc_uid = $5 AND event_id = $6 AND updated_at < $4`,
          [row.last_known_balance, row.last_counter,
           row.pending_top_up_amount, row.updated_at,
           row.nfc_uid, row.event_id],
        );
        if (result.rowCount && result.rowCount > 0) pushed++;
      }
      if (pushed > 0) logger.info({ pushed }, "Railway sync: pushed local balances to cloud");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Railway sync: push balances failed");
  }
}

// ── Local → Railway (transaction_logs) ────────────────────────────────────
async function pushLocalTransactions(): Promise<void> {
  if (!syncPool) return;
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{
        id: string;
        idempotency_key: string;
        bracelet_uid: string;
        location_id: string;
        merchant_id: string;
        event_id: string;
        gross_amount: number;
        tip_amount: number;
        commission_amount: number;
        net_amount: number;
        new_balance: number;
        counter: number;
        performed_by_user_id: string | null;
        offline_created_at: Date | null;
        created_at: Date;
      }>(`
        SELECT id, idempotency_key, bracelet_uid, location_id, merchant_id, event_id,
               gross_amount, tip_amount, commission_amount, net_amount, new_balance, counter,
               performed_by_user_id, offline_created_at, created_at
        FROM transaction_logs
        WHERE created_at > $1
        ORDER BY created_at ASC
        LIMIT 500
      `, [lastTransactionSyncAt]);

      if (rows.length === 0) return;

      let pushed = 0;
      const pushedIds: string[] = [];
      for (const row of rows) {
        try {
          await syncPool!.query(
            `INSERT INTO transaction_logs
             (id, idempotency_key, bracelet_uid, location_id, merchant_id, event_id,
              gross_amount, tip_amount, commission_amount, net_amount, new_balance, counter,
              performed_by_user_id, offline_created_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [row.id, row.idempotency_key, row.bracelet_uid, row.location_id, row.merchant_id,
             row.event_id, row.gross_amount, row.tip_amount, row.commission_amount,
             row.net_amount, row.new_balance, row.counter, row.performed_by_user_id,
             row.offline_created_at, row.created_at],
          );
          pushed++;
          pushedIds.push(row.id);
        } catch (err) {
          logger.warn({ err, id: row.id }, "Railway sync: skipped transaction (FK missing on cloud)");
        }
      }
      lastTransactionSyncAt = rows[rows.length - 1].created_at;
      if (pushed > 0) logger.info({ pushed, total: rows.length }, "Railway sync: pushed transactions to cloud");

      // Push corresponding line items for every successfully pushed transaction
      if (pushedIds.length > 0) {
        const idList = pushedIds.map((_, i) => `$${i + 1}`).join(", ");
        const { rows: lineItems } = await client.query<{
          id: string;
          transaction_log_id: string;
          product_id: string;
          product_name_snapshot: string;
          unit_price_snapshot: number;
          unit_cost_snapshot: number;
          quantity: number;
          iva_amount: number;
          retencion_fuente_amount: number;
          retencion_ica_amount: number;
          created_at: Date;
        }>(`
          SELECT id, transaction_log_id, product_id, product_name_snapshot,
                 unit_price_snapshot, unit_cost_snapshot, quantity,
                 iva_amount, retencion_fuente_amount, retencion_ica_amount, created_at
          FROM transaction_line_items
          WHERE transaction_log_id IN (${idList})
        `, pushedIds);
        let pushedLines = 0;
        for (const li of lineItems) {
          try {
            await syncPool!.query(
              `INSERT INTO transaction_line_items
               (id, transaction_log_id, product_id, product_name_snapshot,
                unit_price_snapshot, unit_cost_snapshot, quantity,
                iva_amount, retencion_fuente_amount, retencion_ica_amount, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (id) DO NOTHING`,
              [li.id, li.transaction_log_id, li.product_id, li.product_name_snapshot,
               li.unit_price_snapshot, li.unit_cost_snapshot, li.quantity,
               li.iva_amount, li.retencion_fuente_amount, li.retencion_ica_amount, li.created_at],
            );
            pushedLines++;
          } catch (err) {
            logger.warn({ err, id: li.id }, "Railway sync: skipped line item");
          }
        }
        if (pushedLines > 0) logger.info({ pushedLines }, "Railway sync: pushed transaction line items to cloud");
      }
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Railway sync: push transactions failed");
  }
}

// ── Local → Railway (top_ups) ──────────────────────────────────────────────
async function pushLocalTopUps(): Promise<void> {
  if (!syncPool) return;
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{
        id: string;
        idempotency_key: string | null;
        bracelet_uid: string;
        amount: number;
        payment_method: string;
        performed_by_user_id: string;
        wompi_transaction_id: string | null;
        status: string;
        new_balance: number;
        new_counter: number;
        offline_created_at: Date | null;
        created_at: Date;
      }>(`
        SELECT id, idempotency_key, bracelet_uid, amount, payment_method,
               performed_by_user_id, wompi_transaction_id, status, new_balance, new_counter,
               offline_created_at, created_at
        FROM top_ups
        WHERE created_at > $1
        ORDER BY created_at ASC
        LIMIT 500
      `, [lastTopUpSyncAt]);

      if (rows.length === 0) return;

      let pushed = 0;
      for (const row of rows) {
        try {
          await syncPool!.query(
            `INSERT INTO top_ups
             (id, idempotency_key, bracelet_uid, amount, payment_method,
              performed_by_user_id, wompi_transaction_id, status, new_balance, new_counter,
              offline_created_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id) DO NOTHING`,
            [row.id, row.idempotency_key, row.bracelet_uid, row.amount, row.payment_method,
             row.performed_by_user_id, row.wompi_transaction_id, row.status, row.new_balance,
             row.new_counter, row.offline_created_at, row.created_at],
          );
          pushed++;
        } catch (err) {
          logger.warn({ err, id: row.id }, "Railway sync: skipped top-up (FK missing on cloud)");
        }
      }
      lastTopUpSyncAt = rows[rows.length - 1].created_at;
      if (pushed > 0) logger.info({ pushed, total: rows.length }, "Railway sync: pushed top-ups to cloud");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Railway sync: push top-ups failed");
  }
}

// ── Sync orchestration ─────────────────────────────────────────────────────
async function runBalanceSync(): Promise<void> {
  await pullRailwayBalances();
  await pushLocalBalances();
  await pushLocalTransactions();
  await pushLocalTopUps();
  lastBalanceSyncAt = new Date();
}

// ── CPU usage helper ───────────────────────────────────────────────────────
function getCpuUsagePercent(): number {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) totalTick += type;
    totalIdle += cpu.times.idle;
  }
  return Math.round((1 - totalIdle / totalTick) * 100);
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
async function pushHeartbeat(): Promise<void> {
  if (!syncPool) return;
  try {
    const serverId = process.env.LOCAL_SERVER_NAME || os.hostname();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuPct = getCpuUsagePercent();

    // Measure Railway latency
    let latencyMs: number | null = null;
    let railwayConnected = false;
    try {
      const t0 = Date.now();
      await syncPool.query("SELECT 1");
      latencyMs = Date.now() - t0;
      railwayConnected = true;
    } catch {
      // railway unreachable
    }

    await syncPool.query(
      `INSERT INTO local_server_heartbeats
         (server_id, cpu_load_percent, memory_used_mb, memory_total_mb,
          process_uptime_s, events_loaded, bracelets_loaded, merchants_loaded,
          users_loaded, railway_latency_ms, railway_connected,
          last_seed_at, last_balance_sync_at, reported_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (server_id) DO UPDATE SET
         cpu_load_percent   = EXCLUDED.cpu_load_percent,
         memory_used_mb     = EXCLUDED.memory_used_mb,
         memory_total_mb    = EXCLUDED.memory_total_mb,
         process_uptime_s   = EXCLUDED.process_uptime_s,
         events_loaded      = EXCLUDED.events_loaded,
         bracelets_loaded   = EXCLUDED.bracelets_loaded,
         merchants_loaded   = EXCLUDED.merchants_loaded,
         users_loaded       = EXCLUDED.users_loaded,
         railway_latency_ms = EXCLUDED.railway_latency_ms,
         railway_connected  = EXCLUDED.railway_connected,
         last_seed_at       = EXCLUDED.last_seed_at,
         last_balance_sync_at = EXCLUDED.last_balance_sync_at,
         reported_at        = now()`,
      [
        serverId,
        cpuPct,
        Math.round((totalMem - freeMem) / 1024 / 1024),
        Math.round(totalMem / 1024 / 1024),
        Math.round(process.uptime()),
        lastSeedStats.events,
        lastSeedStats.bracelets,
        lastSeedStats.merchants,
        lastSeedStats.users,
        latencyMs,
        railwayConnected,
        lastSeedAt,
        lastBalanceSyncAt,
      ],
    );
  } catch (err) {
    logger.warn({ err }, "Railway sync: heartbeat push failed");
  }
}

export function getSyncPool(): pg.Pool | null {
  return syncPool;
}

export async function initSyncPool(railwaySyncUrl: string): Promise<void> {
  syncPool = new pg.Pool({ connectionString: railwaySyncUrl, max: 3 });

  // Ensure heartbeat table exists on Railway
  try {
    await syncPool.query(`
      CREATE TABLE IF NOT EXISTS local_server_heartbeats (
        server_id           TEXT PRIMARY KEY,
        cpu_load_percent    INTEGER,
        memory_used_mb      INTEGER,
        memory_total_mb     INTEGER,
        process_uptime_s    INTEGER,
        events_loaded       INTEGER,
        bracelets_loaded    INTEGER,
        merchants_loaded    INTEGER,
        users_loaded        INTEGER,
        railway_latency_ms  INTEGER,
        railway_connected   BOOLEAN,
        last_seed_at        TIMESTAMPTZ,
        last_balance_sync_at TIMESTAMPTZ,
        reported_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } catch (err) {
    logger.warn({ err }, "Railway sync: could not create local_server_heartbeats table");
  }

  // Warn immediately if any active event uses KDF but HMAC_MASTER_KEY is not set
  if (!process.env.HMAC_MASTER_KEY) {
    try {
      const { rows } = await syncPool.query<{ id: string; name: string }>(
        `SELECT id, name FROM events WHERE (active = true OR ends_at > now() - interval '2 days') AND use_kdf = true LIMIT 5`,
      );
      if (rows.length > 0) {
        const names = rows.map((r) => r.name).join(", ");
        logger.error(
          { events: names },
          "⚠️  HMAC_MASTER_KEY is not set but active event(s) use KDF signing. " +
          "Top-ups and transactions WILL FAIL with 'HMAC_MASTER_KEY not configured'. " +
          "Add HMAC_MASTER_KEY to your .env file (copy from Railway environment variables).",
        );
      }
    } catch {
      // non-fatal — just couldn't check
    }
  }
}

export { seedEventData };

export function startBalanceSyncJob(): void {
  const TWO_MIN = 2 * 60 * 1000;
  const FIVE_MIN = 5 * 60 * 1000;
  const THIRTY_SEC = 30 * 1000;

  // Periodic full seed every 5 min (catalog changes slowly)
  setInterval(seedEventData, FIVE_MIN);

  // Balance/counter sync every 2 min (changes frequently during event)
  setTimeout(runBalanceSync, 15_000);
  setInterval(runBalanceSync, TWO_MIN);

  // Heartbeat every 30s so admin-web can see server health from anywhere
  setTimeout(pushHeartbeat, 5_000);
  setInterval(pushHeartbeat, THIRTY_SEC);

  logger.info("Railway sync started: full seed every 5 min, balance sync every 2 min, heartbeat every 30s");
}

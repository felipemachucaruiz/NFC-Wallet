import pg from "pg";
import { pool } from "@workspace/db";
import { logger } from "./logger";

let syncPool: pg.Pool | null = null;

let lastTransactionSyncAt: Date = new Date(0);
let lastTopUpSyncAt: Date = new Date(0);

// ── Schema-aware upsert helper ─────────────────────────────────────────────
// Queries the LOCAL table for its current column list, then SELECTs only
// those columns from Railway. This handles schema drift gracefully: if Railway
// has extra columns the local DB hasn't seen yet, they're simply skipped.

async function getLocalColumns(localClient: pg.PoolClient, table: string): Promise<string[]> {
  const { rows } = await localClient.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r: { column_name: string }) => r.column_name);
}

// Upsert an array of rows (from SELECT * on Railway) into the local table.
// conflictOn: comma-separated column name(s) that form the unique key.
async function upsertRows(
  localClient: pg.PoolClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictOn: string,
): Promise<void> {
  if (rows.length === 0) return;

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
    const params = batch.flatMap((row) => cols.map((c) => row[c] ?? null));
    const conflict = updateSet
      ? `ON CONFLICT (${conflictOn}) DO UPDATE SET ${updateSet}`
      : `ON CONFLICT (${conflictOn}) DO NOTHING`;
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
  const cols = await getLocalColumns(localClient, table);
  if (cols.length === 0) return [];
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const { rows } = await syncPool!.query(
    `SELECT ${colList} FROM "${table}" ${where}`,
    params,
  );
  return rows as Record<string, unknown>[];
}

// ── Full event data seed: Railway → local ──────────────────────────────────
// Seeds every table the transaction handler reads from so the local server
// can process payments for any active event without manual setup.
// Runs once at startup and then every 5 minutes to stay current.
// Seeding order respects FK constraints.
async function seedEventData(): Promise<void> {
  if (!syncPool) return;
  const localClient = await pool.connect();
  try {
    // Resolve active event IDs first; used to scope all subsequent queries.
    const { rows: eventRows } = await syncPool.query<{ id: string }>(`
      SELECT id FROM events
      WHERE active = true OR ends_at > now() - interval '2 days'
    `);
    const activeEventIds = eventRows.map((r: { id: string }) => r.id);

    if (activeEventIds.length === 0) {
      logger.info("Railway sync: no active events found on Railway — skipping seed");
      return;
    }

    const evIdParam = `($${Array.from({ length: activeEventIds.length }, (_, i) => i + 1).join(", $")})`;

    // 1. promoter_companies (referenced by events — must come first)
    const pcRows = await fetchFromRailway(localClient, "promoter_companies", "");
    await upsertRows(localClient, "promoter_companies", pcRows, "id");

    // 2. events
    const evRows = await fetchFromRailway(
      localClient, "events",
      `WHERE active = true OR ends_at > now() - interval '2 days'`,
    );
    await upsertRows(localClient, "events", evRows, "id");

    // 3. merchants
    const mRows = await fetchFromRailway(
      localClient, "merchants",
      `WHERE event_id IN ${evIdParam}`, activeEventIds,
    );
    await upsertRows(localClient, "merchants", mRows, "id");

    const merchantIds = mRows.map((r) => r["id"] as string);
    if (merchantIds.length === 0) {
      logger.info({ events: activeEventIds.length }, "Railway sync: event data seeded (no merchants yet)");
      return;
    }
    const mIdParam = `($${Array.from({ length: merchantIds.length }, (_, i) => i + 1).join(", $")})`;

    // 4. access_zones
    const azRows = await fetchFromRailway(
      localClient, "access_zones",
      `WHERE event_id IN ${evIdParam}`, activeEventIds,
    );
    await upsertRows(localClient, "access_zones", azRows, "id");

    // 5. locations
    const locRows = await fetchFromRailway(
      localClient, "locations",
      `WHERE event_id IN ${evIdParam}`, activeEventIds,
    );
    await upsertRows(localClient, "locations", locRows, "id");

    const locationIds = locRows.map((r) => r["id"] as string);
    const locIdParam = locationIds.length > 0
      ? `($${Array.from({ length: locationIds.length }, (_, i) => i + 1).join(", $")})`
      : null;

    // 6. products
    const prodRows = await fetchFromRailway(
      localClient, "products",
      `WHERE merchant_id IN ${mIdParam}`, merchantIds,
    );
    await upsertRows(localClient, "products", prodRows, "id");

    // 7. users — all non-attendee staff (no event scoping: admins have no event_id)
    const userRows = await fetchFromRailway(
      localClient, "users",
      `WHERE role != 'attendee'`,
    );
    await upsertRows(localClient, "users", userRows, "id");

    if (locIdParam && locationIds.length > 0) {
      // 8. user_location_assignments
      const ulaRows = await fetchFromRailway(
        localClient, "user_location_assignments",
        `WHERE location_id IN ${locIdParam}`, locationIds,
      );
      await upsertRows(localClient, "user_location_assignments", ulaRows, "id");

      // 9. location_inventory
      const liRows = await fetchFromRailway(
        localClient, "location_inventory",
        `WHERE location_id IN ${locIdParam}`, locationIds,
      );
      await upsertRows(localClient, "location_inventory", liRows, "id");
    }

    // 10. bracelets — full row (all columns needed for NFC verification)
    const brRows = await fetchFromRailway(
      localClient, "bracelets",
      `WHERE event_id IN ${evIdParam}`, activeEventIds,
    );
    await upsertRows(localClient, "bracelets", brRows, "nfc_uid");

    logger.info({
      events: activeEventIds.length,
      merchants: mRows.length,
      locations: locRows.length,
      products: prodRows.length,
      users: userRows.length,
      bracelets: brRows.length,
    }, "Railway sync: event data seeded");
  } catch (err) {
    logger.error({ err }, "Railway sync: event seed failed");
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
        } catch (err) {
          logger.warn({ err, id: row.id }, "Railway sync: skipped transaction (FK missing on cloud)");
        }
      }
      lastTransactionSyncAt = rows[rows.length - 1].created_at;
      if (pushed > 0) logger.info({ pushed, total: rows.length }, "Railway sync: pushed transactions to cloud");
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
}

export function startBalanceSyncJob(railwaySyncUrl: string): void {
  const TWO_MIN = 2 * 60 * 1000;
  const FIVE_MIN = 5 * 60 * 1000;

  syncPool = new pg.Pool({ connectionString: railwaySyncUrl, max: 3 });

  // Full seed on startup, then every 5 min (event catalog changes slowly)
  setTimeout(seedEventData, 5_000);
  setInterval(seedEventData, FIVE_MIN);

  // Balance/counter sync every 2 min (changes frequently during event)
  setTimeout(runBalanceSync, 15_000);
  setInterval(runBalanceSync, TWO_MIN);

  logger.info("Railway sync started: full seed every 5 min, balance sync every 2 min");
}

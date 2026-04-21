import pg from "pg";
import { pool } from "@workspace/db";
import { logger } from "./logger";

let syncPool: pg.Pool | null = null;

async function syncBraceletBalances(): Promise<void> {
  if (!syncPool) return;
  try {
    const { rows } = await syncPool.query<{
      nfc_uid: string;
      balance: number;
      event_id: string;
      updated_at: Date;
    }>(`
      SELECT nfc_uid, balance, event_id, updated_at
      FROM bracelets
      WHERE deleted_at IS NULL
    `);

    if (rows.length === 0) return;

    const client = await pool.connect();
    try {
      for (const row of rows) {
        await client.query(
          `UPDATE bracelets
           SET balance = $1, updated_at = $2
           WHERE nfc_uid = $3 AND event_id = $4 AND updated_at < $2`,
          [row.balance, row.updated_at, row.nfc_uid, row.event_id],
        );
      }
      logger.info({ count: rows.length }, "Railway sync: bracelet balances updated");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Railway sync: failed");
  }
}

export function startBalanceSyncJob(railwaySyncUrl: string): void {
  const TWO_MINUTES_MS = 2 * 60 * 1000;
  syncPool = new pg.Pool({ connectionString: railwaySyncUrl, max: 2 });
  setTimeout(syncBraceletBalances, 8_000);
  setInterval(syncBraceletBalances, TWO_MINUTES_MS);
  logger.info("Railway balance sync job scheduled (every 2 minutes)");
}

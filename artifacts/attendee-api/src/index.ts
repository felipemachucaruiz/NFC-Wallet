// gate role added to UserRole enum — force rebuild
import { db, sessionsTable, wompiPaymentIntentsTable } from "@workspace/db";
import { lt, eq, and } from "drizzle-orm";
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

const PAYMENT_INTENT_EXPIRY_MS = Number(process.env.PAYMENT_INTENT_EXPIRY_MINUTES ?? "30") * 60 * 1000;
const PAYMENT_INTENT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

async function expireStalePaymentIntents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PAYMENT_INTENT_EXPIRY_MS);
    const expired = await db
      .update(wompiPaymentIntentsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(wompiPaymentIntentsTable.status, "pending"),
          lt(wompiPaymentIntentsTable.createdAt, cutoff),
        ),
      )
      .returning({ id: wompiPaymentIntentsTable.id });

    if (expired.length > 0) {
      logger.info({ count: expired.length }, "Expired stale payment intents");
    }
  } catch (err) {
    logger.error({ err }, "Failed to expire stale payment intents");
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
  setTimeout(runCleanup, 10000);
  setInterval(runCleanup, ONE_HOUR_MS);
  logger.info("Session cleanup job scheduled (every 1 hour)");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  startSessionCleanupJob();
  logger.info({ port }, "Attendee API server listening");

  expireStalePaymentIntents().catch(() => {});
  setInterval(() => {
    expireStalePaymentIntents().catch(() => {});
  }, PAYMENT_INTENT_CLEANUP_INTERVAL_MS);
});

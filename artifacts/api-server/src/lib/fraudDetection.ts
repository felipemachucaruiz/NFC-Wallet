import { db, transactionLogsTable, topUpsTable, fraudAlertsTable, braceletsTable, locationsTable, merchantsTable } from "@workspace/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { sendFraudAlertPushNotifications } from "./pushNotifications";

const HIGH_VALUE_THRESHOLD_COP = 200_000;
const DOUBLE_LOCATION_WINDOW_MS = 5 * 60 * 1000;
const HIGH_VALUE_WINDOW_MS = 10 * 60 * 1000;
const HIGH_VALUE_COUNT_THRESHOLD = 5;

export async function createAlert(params: {
  eventId: string;
  type: "double_location" | "offline_volume_anomaly" | "high_value_staff" | "balance_increase_no_topup" | "manual_report" | "hmac_invalid";
  severity: "low" | "medium" | "high" | "critical";
  entityType: "bracelet" | "pos" | "staff";
  entityId: string;
  description: string;
  reportedBy?: string | null;
}) {
  try {
    const [alert] = await db.insert(fraudAlertsTable).values(params).returning();
    if (alert && (params.severity === "high" || params.severity === "critical")) {
      void sendFraudAlertPushNotifications({
        eventId: params.eventId,
        alertType: params.type,
        severity: params.severity,
        description: params.description,
      });
    }
    return alert;
  } catch {
    return null;
  }
}

export async function detectDoubleLocation(
  nfcUid: string,
  locationId: string,
  eventId: string,
  transactionTime: Date,
) {
  try {
    const windowStart = new Date(transactionTime.getTime() - DOUBLE_LOCATION_WINDOW_MS);
    const recentTxs = await db
      .select()
      .from(transactionLogsTable)
      .where(
        and(
          eq(transactionLogsTable.braceletUid, nfcUid),
          gte(transactionLogsTable.createdAt, windowStart),
        ),
      )
      .orderBy(desc(transactionLogsTable.createdAt));

    if (recentTxs.length === 0) return null;

    const differentLocation = recentTxs.find((tx) => tx.locationId !== locationId);
    if (!differentLocation) return null;

    const [loc1] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, locationId));
    const [loc2] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, differentLocation.locationId));

    return createAlert({
      eventId,
      type: "double_location",
      severity: "critical",
      entityType: "bracelet",
      entityId: nfcUid,
      description: `Bracelet ${nfcUid} used at "${loc2?.name ?? differentLocation.locationId}" and "${loc1?.name ?? locationId}" within 5 minutes.`,
    });
  } catch {
    return null;
  }
}

export async function detectOfflineVolumeAnomaly(
  locationId: string,
  eventId: string,
  syncedCount: number,
) {
  if (syncedCount < 5) return null;

  try {
    const allLocStats = await db
      .select({
        locationId: transactionLogsTable.locationId,
        count: sql<number>`count(*)::int`,
      })
      .from(transactionLogsTable)
      .where(eq(transactionLogsTable.eventId, eventId))
      .groupBy(transactionLogsTable.locationId);

    if (allLocStats.length < 3) return null;

    const counts = allLocStats.map((r) => r.count);
    const avg = counts.reduce((s, c) => s + c, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    const zScore = (syncedCount - avg) / stdDev;
    if (zScore < 2.5) return null;

    const [loc] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, locationId));

    return createAlert({
      eventId,
      type: "offline_volume_anomaly",
      severity: "high",
      entityType: "pos",
      entityId: locationId,
      description: `POS "${loc?.name ?? locationId}" synced ${syncedCount} offline transactions (z-score: ${zScore.toFixed(2)}, avg: ${avg.toFixed(0)}).`,
    });
  } catch {
    return null;
  }
}

export async function detectHighValueStaff(
  performedByUserId: string,
  eventId: string,
  transactionTime: Date,
  grossAmountCop: number,
) {
  if (grossAmountCop < HIGH_VALUE_THRESHOLD_COP) return null;

  try {
    const windowStart = new Date(transactionTime.getTime() - HIGH_VALUE_WINDOW_MS);
    const recentHighValueTxs = await db
      .select()
      .from(transactionLogsTable)
      .where(
        and(
          eq(transactionLogsTable.performedByUserId, performedByUserId),
          eq(transactionLogsTable.eventId, eventId),
          gte(transactionLogsTable.createdAt, windowStart),
          sql`${transactionLogsTable.grossAmountCop} >= ${HIGH_VALUE_THRESHOLD_COP}`,
        ),
      );

    if (recentHighValueTxs.length < HIGH_VALUE_COUNT_THRESHOLD) return null;

    return createAlert({
      eventId,
      type: "high_value_staff",
      severity: "high",
      entityType: "staff",
      entityId: performedByUserId,
      description: `Staff ${performedByUserId} processed ${recentHighValueTxs.length + 1} transactions over $${(HIGH_VALUE_THRESHOLD_COP / 1000).toFixed(0)}k COP in 10 minutes.`,
    });
  } catch {
    return null;
  }
}

export async function detectBalanceIncreaseNoTopUp(
  nfcUid: string,
  eventId: string,
  previousBalanceCop: number,
  newBalanceCop: number,
  transactionTime: Date,
) {
  try {
    if (newBalanceCop <= previousBalanceCop) return null;

    const balanceDiff = newBalanceCop - previousBalanceCop;

    const lastTxTime = new Date(transactionTime.getTime() - 60 * 1000);
    const recentTopUps = await db
      .select()
      .from(topUpsTable)
      .where(
        and(
          eq(topUpsTable.braceletUid, nfcUid),
          gte(topUpsTable.createdAt, lastTxTime),
        ),
      );

    if (recentTopUps.length > 0) return null;

    return createAlert({
      eventId,
      type: "balance_increase_no_topup",
      severity: "critical",
      entityType: "bracelet",
      entityId: nfcUid,
      description: `Bracelet ${nfcUid} balance increased by ${balanceDiff} COP (from ${previousBalanceCop} to ${newBalanceCop}) without a registered top-up.`,
    });
  } catch {
    return null;
  }
}

export async function runFraudDetection(params: {
  nfcUid: string;
  locationId: string;
  eventId: string;
  grossAmountCop: number;
  previousBalanceCop: number;
  newBalanceCop: number;
  performedByUserId: string;
  transactionTime: Date;
}) {
  const { nfcUid, locationId, eventId, grossAmountCop, previousBalanceCop, newBalanceCop, performedByUserId, transactionTime } = params;

  await Promise.allSettled([
    detectDoubleLocation(nfcUid, locationId, eventId, transactionTime),
    detectHighValueStaff(performedByUserId, eventId, transactionTime, grossAmountCop),
    detectBalanceIncreaseNoTopUp(nfcUid, eventId, previousBalanceCop, newBalanceCop, transactionTime),
  ]);
}

export async function runSyncFraudDetection(params: {
  locationId: string;
  eventId: string;
  syncedCount: number;
}) {
  await detectOfflineVolumeAnomaly(params.locationId, params.eventId, params.syncedCount);
}

import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  transactionLogsTable,
  transactionLineItemsTable,
  topUpsTable,
  merchantsTable,
  locationsTable,
  locationInventoryTable,
  productsTable,
  braceletsTable,
  eventsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

async function resolveEventIds(req: Request, queryEventId?: string): Promise<string[] | null> {
  const user = req.user!;

  if (user.role === "event_admin") {
    if (user.eventId) return [user.eventId];
    const companyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
    if (companyId) {
      const rows = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(eq(eventsTable.promoterCompanyId, companyId));
      return rows.map((r) => r.id);
    }
    return [];
  }

  if (user.role === "admin") {
    if (queryEventId) return [queryEventId];
    return null;
  }

  return [];
}

function buildDateConditions(from?: string, to?: string) {
  const conds = [];
  if (from) conds.push(gte(transactionLogsTable.createdAt, new Date(from)));
  if (to) conds.push(lte(transactionLogsTable.createdAt, new Date(to)));
  return conds;
}

router.get(
  "/analytics/summary",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);

    if (eventIds !== null && eventIds.length === 0) {
      res.json({ totalTopUpsCop: 0, totalSalesCop: 0, pendingBalanceCop: 0, transactionCount: 0, topUpCount: 0 });
      return;
    }

    const txConditions = [];
    if (eventIds !== null) txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    txConditions.push(...buildDateConditions(from, to));

    const [txAgg] = await db
      .select({
        totalSalesCop: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmountCop}), 0)`.mapWith(Number),
        transactionCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined);

    const braceletConditions = [];
    if (eventIds !== null) braceletConditions.push(inArray(braceletsTable.eventId, eventIds));

    const [braceletAgg] = await db
      .select({
        pendingBalanceCop: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalanceCop}), 0)`.mapWith(Number),
        braceletCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(braceletsTable)
      .where(braceletConditions.length > 0 ? and(...braceletConditions) : undefined);

    const topUpDateConds = [];
    if (from) topUpDateConds.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) topUpDateConds.push(lte(topUpsTable.createdAt, new Date(to)));

    let totalTopUpsCop = 0;
    let topUpCount = 0;

    if (eventIds !== null && eventIds.length > 0) {
      const [topUpAgg] = await db
        .select({
          totalTopUpsCop: sql<number>`COALESCE(SUM(${topUpsTable.amountCop}), 0)`.mapWith(Number),
          topUpCount: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(topUpsTable)
        .innerJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
        .where(and(inArray(braceletsTable.eventId, eventIds), ...topUpDateConds));
      totalTopUpsCop = topUpAgg?.totalTopUpsCop ?? 0;
      topUpCount = topUpAgg?.topUpCount ?? 0;
    } else if (eventIds === null) {
      const [topUpAgg] = await db
        .select({
          totalTopUpsCop: sql<number>`COALESCE(SUM(${topUpsTable.amountCop}), 0)`.mapWith(Number),
          topUpCount: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(topUpsTable)
        .where(topUpDateConds.length > 0 ? and(...topUpDateConds) : undefined);
      totalTopUpsCop = topUpAgg?.totalTopUpsCop ?? 0;
      topUpCount = topUpAgg?.topUpCount ?? 0;
    }

    res.json({
      totalTopUpsCop,
      totalSalesCop: txAgg?.totalSalesCop ?? 0,
      pendingBalanceCop: braceletAgg?.pendingBalanceCop ?? 0,
      transactionCount: txAgg?.transactionCount ?? 0,
      topUpCount,
      braceletCount: braceletAgg?.braceletCount ?? 0,
    });
  },
);

router.get(
  "/analytics/sales-by-hour",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);

    const txConditions = [];
    if (eventIds !== null) {
      if (eventIds.length === 0) {
        res.json({ salesByHour: [] });
        return;
      }
      txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    }
    txConditions.push(...buildDateConditions(from, to));

    const rows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`.as("hour"),
        day: sql<string>`DATE(${transactionLogsTable.createdAt})`.as("day"),
        totalCop: sql<number>`SUM(${transactionLogsTable.grossAmountCop})`.as("total_cop"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(
        sql`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`,
        sql`DATE(${transactionLogsTable.createdAt})`,
      )
      .orderBy(
        sql`DATE(${transactionLogsTable.createdAt})`,
        sql`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`,
      );

    const salesByHour = rows.map((r) => ({
      hour: Number(r.hour),
      day: String(r.day),
      totalCop: Number(r.totalCop),
      txCount: Number(r.txCount),
    }));

    res.json({ salesByHour });
  },
);

router.get(
  "/analytics/top-products",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to, limit: limitParam } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);
    const limit = Math.min(parseInt(limitParam ?? "10", 10), 50);

    const txConditions = [];
    if (eventIds !== null) {
      if (eventIds.length === 0) {
        res.json({ topProducts: [] });
        return;
      }
      txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    }
    txConditions.push(...buildDateConditions(from, to));

    const rows = await db
      .select({
        productId: transactionLineItemsTable.productId,
        productName: transactionLineItemsTable.productNameSnapshot,
        totalUnits: sql<number>`SUM(${transactionLineItemsTable.quantity})`.as("total_units"),
        totalRevenueCop: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitPriceSnapshot})`.as("total_revenue_cop"),
        totalCogsCop: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitCostSnapshot})`.as("total_cogs_cop"),
      })
      .from(transactionLineItemsTable)
      .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(transactionLineItemsTable.productId, transactionLineItemsTable.productNameSnapshot)
      .orderBy(sql`SUM(${transactionLineItemsTable.quantity}) DESC`)
      .limit(limit);

    const topProducts = rows.map((r) => {
      const rev = Number(r.totalRevenueCop);
      const cogs = Number(r.totalCogsCop);
      const profit = rev - cogs;
      const marginPct = rev > 0 ? Math.round((profit / rev) * 10000) / 100 : 0;
      return {
        productId: r.productId,
        productName: r.productName,
        totalUnits: Number(r.totalUnits),
        totalRevenueCop: rev,
        totalCogsCop: cogs,
        grossProfitCop: profit,
        profitMarginPercent: marginPct,
      };
    });

    res.json({ topProducts });
  },
);

router.get(
  "/analytics/top-merchants",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to, limit: limitParam } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);
    const limit = Math.min(parseInt(limitParam ?? "10", 10), 50);

    const txConditions = [];
    if (eventIds !== null) {
      if (eventIds.length === 0) {
        res.json({ topMerchants: [] });
        return;
      }
      txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    }
    txConditions.push(...buildDateConditions(from, to));

    const rows = await db
      .select({
        merchantId: transactionLogsTable.merchantId,
        totalSalesCop: sql<number>`SUM(${transactionLogsTable.grossAmountCop})`.as("total_sales_cop"),
        totalCommissionCop: sql<number>`SUM(${transactionLogsTable.commissionAmountCop})`.as("total_commission_cop"),
        totalNetCop: sql<number>`SUM(${transactionLogsTable.netAmountCop})`.as("total_net_cop"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(transactionLogsTable.merchantId)
      .orderBy(sql`SUM(${transactionLogsTable.grossAmountCop}) DESC`)
      .limit(limit);

    const merchantIds = rows.map((r) => r.merchantId);
    let merchants: { id: string; name: string }[] = [];
    if (merchantIds.length > 0) {
      merchants = await db.select({ id: merchantsTable.id, name: merchantsTable.name }).from(merchantsTable).where(inArray(merchantsTable.id, merchantIds));
    }

    const merchantNameMap = new Map(merchants.map((m) => [m.id, m.name]));

    const txCogsRows = await (async () => {
      if (rows.length === 0) return [];
      const txConds = [...txConditions];
      const cogsRows = await db
        .select({
          merchantId: transactionLogsTable.merchantId,
          totalCogsCop: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitCostSnapshot})`.as("total_cogs_cop"),
        })
        .from(transactionLineItemsTable)
        .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
        .where(txConds.length > 0 ? and(...txConds) : undefined)
        .groupBy(transactionLogsTable.merchantId);
      return cogsRows;
    })();

    const cogsMap = new Map(txCogsRows.map((r) => [r.merchantId, Number(r.totalCogsCop)]));

    const topMerchants = rows.map((r) => {
      const sales = Number(r.totalSalesCop);
      const cogs = cogsMap.get(r.merchantId) ?? 0;
      const profit = sales - cogs;
      const marginPct = sales > 0 ? Math.round((profit / sales) * 10000) / 100 : 0;
      return {
        merchantId: r.merchantId,
        merchantName: merchantNameMap.get(r.merchantId) ?? r.merchantId,
        totalSalesCop: sales,
        totalCommissionCop: Number(r.totalCommissionCop),
        totalNetCop: Number(r.totalNetCop),
        totalCogsCop: cogs,
        grossProfitCop: profit,
        profitMarginPercent: marginPct,
        txCount: Number(r.txCount),
      };
    });

    res.json({ topMerchants });
  },
);

router.get(
  "/analytics/stock-alerts",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    let locationIds: string[] | null = null;

    if (user.role === "event_admin") {
      const effectiveEventId = user.eventId ?? undefined;
      if (!effectiveEventId) {
        res.json({ alerts: [] });
        return;
      }
      const locs = await db
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.eventId, effectiveEventId));
      locationIds = locs.map((l) => l.id);
    } else {
      if (eventId) {
        const locs = await db
          .select({ id: locationsTable.id })
          .from(locationsTable)
          .where(eq(locationsTable.eventId, eventId));
        locationIds = locs.map((l) => l.id);
      }
    }

    if (locationIds !== null && locationIds.length === 0) {
      res.json({ alerts: [] });
      return;
    }

    const locationFilter =
      locationIds !== null
        ? inArray(locationInventoryTable.locationId, locationIds)
        : undefined;

    let invQuery = db
      .select({
        id: locationInventoryTable.id,
        locationId: locationInventoryTable.locationId,
        productId: locationInventoryTable.productId,
        quantityOnHand: locationInventoryTable.quantityOnHand,
        restockTrigger: locationInventoryTable.restockTrigger,
        restockTargetQty: locationInventoryTable.restockTargetQty,
      })
      .from(locationInventoryTable)
      .where(
        and(
          locationFilter,
          sql`${locationInventoryTable.quantityOnHand} <= ${locationInventoryTable.restockTrigger}`,
        ),
      );

    const invRows = await invQuery;

    if (invRows.length === 0) {
      res.json({ alerts: [] });
      return;
    }

    const uniqueLocationIds = [...new Set(invRows.map((r) => r.locationId))];
    const uniqueProductIds = [...new Set(invRows.map((r) => r.productId))];

    const [locationRows, productRows] = await Promise.all([
      db.select({ id: locationsTable.id, name: locationsTable.name, eventId: locationsTable.eventId }).from(locationsTable).where(inArray(locationsTable.id, uniqueLocationIds)),
      db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable).where(inArray(productsTable.id, uniqueProductIds)),
    ]);

    const locationMap = new Map(locationRows.map((l) => [l.id, l]));
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    const alerts = invRows.map((row) => ({
      inventoryId: row.id,
      locationId: row.locationId,
      locationName: locationMap.get(row.locationId)?.name ?? row.locationId,
      eventId: locationMap.get(row.locationId)?.eventId ?? null,
      productId: row.productId,
      productName: productMap.get(row.productId)?.name ?? row.productId,
      quantityOnHand: row.quantityOnHand,
      restockTrigger: row.restockTrigger,
      restockTargetQty: row.restockTargetQty,
      deficit: row.restockTrigger - row.quantityOnHand,
    }));

    alerts.sort((a, b) => a.quantityOnHand - b.quantityOnHand);

    res.json({ alerts });
  },
);

router.get(
  "/analytics/heatmap",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);

    const txConditions = [];
    if (eventIds !== null) {
      if (eventIds.length === 0) {
        res.json({ heatmap: [] });
        return;
      }
      txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    }
    txConditions.push(...buildDateConditions(from, to));

    const rows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`.as("hour"),
        day: sql<string>`TO_CHAR(${transactionLogsTable.createdAt}, 'Dy')`.as("day"),
        dayNum: sql<number>`EXTRACT(DOW FROM ${transactionLogsTable.createdAt})`.as("day_num"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
        totalCop: sql<number>`SUM(${transactionLogsTable.grossAmountCop})`.as("total_cop"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(
        sql`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`,
        sql`TO_CHAR(${transactionLogsTable.createdAt}, 'Dy')`,
        sql`EXTRACT(DOW FROM ${transactionLogsTable.createdAt})`,
      )
      .orderBy(
        sql`EXTRACT(DOW FROM ${transactionLogsTable.createdAt})`,
        sql`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt})`,
      );

    const heatmap = rows.map((r) => ({
      hour: Number(r.hour),
      day: String(r.day),
      dayNum: Number(r.dayNum),
      txCount: Number(r.txCount),
      totalCop: Number(r.totalCop),
    }));

    res.json({ heatmap });
  },
);

export default router;

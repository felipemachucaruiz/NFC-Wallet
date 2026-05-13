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
  ticketOrdersTable,
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
      res.json({ totalTopUps: 0, totalSales: 0, pendingBalance: 0, transactionCount: 0, topUpCount: 0 });
      return;
    }

    const txConditions = [];
    if (eventIds !== null) txConditions.push(inArray(transactionLogsTable.eventId, eventIds));
    txConditions.push(...buildDateConditions(from, to));

    const [txAgg] = await db
      .select({
        totalSales: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
        transactionCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined);

    const braceletConditions = [];
    if (eventIds !== null) braceletConditions.push(inArray(braceletsTable.eventId, eventIds));

    const [braceletAgg] = await db
      .select({
        pendingBalance: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalance}), 0)`.mapWith(Number),
        braceletCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(braceletsTable)
      .where(braceletConditions.length > 0 ? and(...braceletConditions) : undefined);

    const topUpDateConds = [];
    if (from) topUpDateConds.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) topUpDateConds.push(lte(topUpsTable.createdAt, new Date(to)));

    let totalTopUps = 0;
    let topUpCount = 0;

    if (eventIds !== null && eventIds.length > 0) {
      const [topUpAgg] = await db
        .select({
          totalTopUps: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number),
          topUpCount: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(topUpsTable)
        .innerJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
        .where(and(inArray(braceletsTable.eventId, eventIds), ...topUpDateConds));
      totalTopUps = topUpAgg?.totalTopUps ?? 0;
      topUpCount = topUpAgg?.topUpCount ?? 0;
    } else if (eventIds === null) {
      const [topUpAgg] = await db
        .select({
          totalTopUps: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number),
          topUpCount: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(topUpsTable)
        .where(topUpDateConds.length > 0 ? and(...topUpDateConds) : undefined);
      totalTopUps = topUpAgg?.totalTopUps ?? 0;
      topUpCount = topUpAgg?.topUpCount ?? 0;
    }

    const ticketConditions = [eq(ticketOrdersTable.paymentStatus, "confirmed")];
    if (eventIds !== null) ticketConditions.push(inArray(ticketOrdersTable.eventId, eventIds));

    const [ticketAgg] = await db
      .select({
        ticketSales: sql<number>`COALESCE(SUM(${ticketOrdersTable.totalAmount}), 0)`.mapWith(Number),
        ticketOrderCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ticketOrdersTable)
      .where(and(...ticketConditions));

    res.json({
      totalTopUps,
      totalSales: txAgg?.totalSales ?? 0,
      pendingBalance: braceletAgg?.pendingBalance ?? 0,
      transactionCount: txAgg?.transactionCount ?? 0,
      topUpCount,
      braceletCount: braceletAgg?.braceletCount ?? 0,
      ticketSales: ticketAgg?.ticketSales ?? 0,
      ticketOrderCount: ticketAgg?.ticketOrderCount ?? 0,
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

    let tz = "UTC";
    if (eventId) {
      const [ev] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventId));
      if (ev?.timezone) tz = ev.timezone;
    } else if (eventIds !== null && eventIds.length === 1) {
      const [ev] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventIds[0]!));
      if (ev?.timezone) tz = ev.timezone;
    }

    const localTs = sql`(${transactionLogsTable.createdAt} AT TIME ZONE ${tz})`;

    const rows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${localTs})`.as("hour"),
        day: sql<string>`DATE(${localTs})`.as("day"),
        total: sql<number>`SUM(${transactionLogsTable.grossAmount})`.as("total_cop"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`2`, sql`1`);

    const salesByHour = rows.map((r) => ({
      hour: Number(r.hour),
      day: String(r.day),
      total: Number(r.total),
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
        totalRevenue: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitPriceSnapshot})`.as("total_revenue_cop"),
        totalCogs: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitCostSnapshot})`.as("total_cogs_cop"),
      })
      .from(transactionLineItemsTable)
      .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(transactionLineItemsTable.productId, transactionLineItemsTable.productNameSnapshot)
      .orderBy(sql`SUM(${transactionLineItemsTable.quantity}) DESC`)
      .limit(limit);

    const topProducts = rows.map((r) => {
      const rev = Number(r.totalRevenue);
      const cogs = Number(r.totalCogs);
      const profit = rev - cogs;
      const marginPct = rev > 0 ? Math.round((profit / rev) * 10000) / 100 : 0;
      return {
        productId: r.productId,
        productName: r.productName,
        totalUnits: Number(r.totalUnits),
        totalRevenue: rev,
        totalCogs: cogs,
        grossProfit: profit,
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
        totalSales: sql<number>`SUM(${transactionLogsTable.grossAmount})`.as("total_sales_cop"),
        totalCommission: sql<number>`SUM(${transactionLogsTable.commissionAmount})`.as("total_commission_cop"),
        totalNet: sql<number>`SUM(${transactionLogsTable.netAmount})`.as("total_net_cop"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(transactionLogsTable.merchantId)
      .orderBy(sql`SUM(${transactionLogsTable.grossAmount}) DESC`)
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
          totalCogs: sql<number>`SUM(${transactionLineItemsTable.quantity} * ${transactionLineItemsTable.unitCostSnapshot})`.as("total_cogs_cop"),
        })
        .from(transactionLineItemsTable)
        .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
        .where(txConds.length > 0 ? and(...txConds) : undefined)
        .groupBy(transactionLogsTable.merchantId);
      return cogsRows;
    })();

    const cogsMap = new Map(txCogsRows.map((r) => [r.merchantId, Number(r.totalCogs)]));

    const topMerchants = rows.map((r) => {
      const sales = Number(r.totalSales);
      const cogs = cogsMap.get(r.merchantId) ?? 0;
      const profit = sales - cogs;
      const marginPct = sales > 0 ? Math.round((profit / sales) * 10000) / 100 : 0;
      return {
        merchantId: r.merchantId,
        merchantName: merchantNameMap.get(r.merchantId) ?? r.merchantId,
        totalSales: sales,
        totalCommission: Number(r.totalCommission),
        totalNet: Number(r.totalNet),
        totalCogs: cogs,
        grossProfit: profit,
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

    let tz = "UTC";
    if (eventId) {
      const [ev] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventId));
      if (ev?.timezone) tz = ev.timezone;
    } else if (eventIds !== null && eventIds.length === 1) {
      const [ev] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventIds[0]!));
      if (ev?.timezone) tz = ev.timezone;
    }

    const localTs = sql`(${transactionLogsTable.createdAt} AT TIME ZONE ${tz})`;

    const rows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${localTs})`.as("hour"),
        day: sql<string>`TO_CHAR(${localTs}, 'Dy')`.as("day"),
        dayNum: sql<number>`EXTRACT(DOW FROM ${localTs})`.as("day_num"),
        txCount: sql<number>`COUNT(*)`.as("tx_count"),
        total: sql<number>`SUM(${transactionLogsTable.grossAmount})`.as("total_cop"),
      })
      .from(transactionLogsTable)
      .where(txConditions.length > 0 ? and(...txConditions) : undefined)
      .groupBy(sql`1`, sql`2`, sql`3`)
      .orderBy(sql`3`, sql`1`);

    const heatmap = rows.map((r) => ({
      hour: Number(r.hour),
      day: String(r.day),
      dayNum: Number(r.dayNum),
      txCount: Number(r.txCount),
      total: Number(r.total),
    }));

    res.json({ heatmap });
  },
);

router.get(
  "/analytics/wallet-behavior",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);

    if (eventIds !== null && eventIds.length === 0) {
      res.json({ activeBracelets: 0, totalBracelets: 0, activationRate: 0, reloadedBracelets: 0, reloadRate: 0, avgSpend: 0, avgTopUp: 0, topupsByHour: [], spendConcentration: [] });
      return;
    }

    const effectiveEventId = eventId ?? (eventIds?.length === 1 ? eventIds[0] : undefined);

    let tz = "UTC";
    if (effectiveEventId) {
      const [ev] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, effectiveEventId));
      if (ev?.timezone) tz = ev.timezone;
    }

    const braceletCond = eventIds !== null ? inArray(braceletsTable.eventId, eventIds) : undefined;

    const [braceletAgg] = await db
      .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(braceletsTable)
      .where(braceletCond);

    const totalBracelets = braceletAgg?.total ?? 0;

    const txCond = eventIds !== null ? inArray(transactionLogsTable.eventId, eventIds) : undefined;

    const [activeAgg] = await db
      .select({ activeBracelets: sql<number>`COUNT(DISTINCT ${transactionLogsTable.braceletUid})`.mapWith(Number) })
      .from(transactionLogsTable)
      .where(txCond);

    const activeBracelets = activeAgg?.activeBracelets ?? 0;

    const braceletUids = eventIds !== null
      ? (await db.select({ uid: braceletsTable.nfcUid }).from(braceletsTable).where(braceletCond!)).map((r) => r.uid)
      : null;

    let reloadedBracelets = 0;
    let totalTopUpAmount = 0;
    let topupsByHour: { hour: number; amount: number; count: number }[] = [];

    if (braceletUids === null || braceletUids.length > 0) {
      const topUpCond = braceletUids !== null ? inArray(topUpsTable.braceletUid, braceletUids) : undefined;

      const [reloadAgg] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${topUpsTable.braceletUid})`.mapWith(Number), total: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number) })
        .from(topUpsTable)
        .where(topUpCond);

      reloadedBracelets = reloadAgg?.count ?? 0;
      totalTopUpAmount = reloadAgg?.total ?? 0;

      const localTs = sql`(${topUpsTable.createdAt} AT TIME ZONE ${tz})`;
      const hourRows = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${localTs})`.as("hour"),
          amount: sql<number>`SUM(${topUpsTable.amount})`.as("amount"),
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(topUpsTable)
        .where(topUpCond)
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      topupsByHour = hourRows.map((r) => ({ hour: Number(r.hour), amount: Number(r.amount), count: Number(r.count) }));
    }

    const [totalSalesAgg] = await db
      .select({ total: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number) })
      .from(transactionLogsTable)
      .where(txCond);

    const totalSales = totalSalesAgg?.total ?? 0;
    const avgSpend = activeBracelets > 0 ? totalSales / activeBracelets : 0;
    const avgTopUp = reloadedBracelets > 0 ? totalTopUpAmount / reloadedBracelets : 0;
    const activationRate = totalBracelets > 0 ? activeBracelets / totalBracelets : 0;
    const reloadRate = totalBracelets > 0 ? reloadedBracelets / totalBracelets : 0;

    // Pareto: per-bracelet spend sorted descending, compute concentration at 10%…100%
    const spendRows = await db
      .select({
        braceletUid: transactionLogsTable.braceletUid,
        spend: sql<number>`SUM(${transactionLogsTable.grossAmount})`.as("spend"),
      })
      .from(transactionLogsTable)
      .where(txCond)
      .groupBy(transactionLogsTable.braceletUid)
      .orderBy(sql`SUM(${transactionLogsTable.grossAmount}) DESC`);

    const spends = spendRows.map((r) => Number(r.spend));
    const spendTotal = spends.reduce((a, b) => a + b, 0);
    const spendConcentration: { pct: number; revShare: number }[] = [];
    if (spends.length > 0 && spendTotal > 0) {
      let cumulative = 0;
      for (const pct of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
        const topN = Math.max(1, Math.round((pct / 100) * spends.length));
        cumulative = spends.slice(0, topN).reduce((a, b) => a + b, 0);
        spendConcentration.push({ pct, revShare: Math.round((cumulative / spendTotal) * 1000) / 10 });
      }
    }

    res.json({ activeBracelets, totalBracelets, activationRate, reloadedBracelets, reloadRate, avgSpend, avgTopUp, topupsByHour, spendConcentration });
  },
);

router.get(
  "/analytics/merchant-health",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.query as Record<string, string | undefined>;
    const eventIds = await resolveEventIds(req, eventId);

    if (eventIds !== null && eventIds.length === 0) {
      res.json({ merchants: [] });
      return;
    }

    const txCond = eventIds !== null ? inArray(transactionLogsTable.eventId, eventIds) : undefined;
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const rows = await db
      .select({
        merchantId: transactionLogsTable.merchantId,
        lastTransactionAt: sql<string>`MAX(${transactionLogsTable.createdAt})`.as("last_tx"),
        totalTx: sql<number>`COUNT(*)`.mapWith(Number),
        recentTx: sql<number>`COUNT(*) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${thirtyMinAgo})`.mapWith(Number),
      })
      .from(transactionLogsTable)
      .where(txCond)
      .groupBy(transactionLogsTable.merchantId)
      .orderBy(sql`MAX(${transactionLogsTable.createdAt}) DESC`);

    const merchantIds = rows.map((r) => r.merchantId);
    let merchantNames: { id: string; name: string }[] = [];
    if (merchantIds.length > 0) {
      merchantNames = await db.select({ id: merchantsTable.id, name: merchantsTable.name }).from(merchantsTable).where(inArray(merchantsTable.id, merchantIds));
    }
    const nameMap = new Map(merchantNames.map((m) => [m.id, m.name]));

    const merchants = rows.map((r) => {
      const lastAt = new Date(r.lastTransactionAt);
      const minutesSince = Math.floor((now.getTime() - lastAt.getTime()) / 60000);
      return {
        merchantId: r.merchantId,
        merchantName: nameMap.get(r.merchantId) ?? r.merchantId,
        lastTransactionAt: r.lastTransactionAt,
        minutesSince,
        recentTx: Number(r.recentTx),
        totalTx: Number(r.totalTx),
      };
    });

    res.json({ merchants });
  },
);

export default router;


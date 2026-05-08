import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionLogsTable, transactionLineItemsTable, topUpsTable, merchantsTable, locationsTable, locationInventoryTable, productsTable, merchantPayoutsTable, braceletsTable, eventsTable, usersTable, inventoryAuditsTable, inventoryAuditItemsTable, damagedGoodsTable, ticketsTable, ticketCheckInsTable, ticketTypesTable, ticketOrdersTable, guestListsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { createAlert } from "../lib/fraudDetection";
import type { AuthUser } from "@workspace/api-zod";

async function getEventIdsByPromoterCompany(promoterCompanyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(eq(eventsTable.promoterCompanyId, promoterCompanyId));
  return rows.map((r) => r.id);
}

const router: IRouter = Router();

router.get(
  "/reports/revenue",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, merchantId, locationId, from, to, promoterCompanyId } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const conditions = [];
    let topUpEventIds: string[] | null = null;

    const emptyRevenue = { totalSales: 0, totalCogs: 0, grossProfit: 0, totalCommissions: 0, platformRevenue: 0, netOwedToMerchants: 0, transactionCount: 0, totalTopUps: 0, topUpCount: 0, braceletCount: 0, totals: { grossSales: 0, totalTips: 0, cogs: 0, grossProfit: 0, profitMarginPercent: 0, commission: 0, net: 0, transactionCount: 0 }, byMerchant: [] };

    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      if (userCompanyId) {
        const companyEventIds = await getEventIdsByPromoterCompany(userCompanyId);
        if (companyEventIds.length === 0) {
          res.json(emptyRevenue);
          return;
        }
        topUpEventIds = companyEventIds;
        conditions.push(inArray(transactionLogsTable.eventId, companyEventIds));
        if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
        if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
        if (locationId) conditions.push(eq(transactionLogsTable.locationId, locationId));
      } else {
        if (!user.eventId) {
          res.json(emptyRevenue);
          return;
        }
        topUpEventIds = [user.eventId!];
        conditions.push(eq(transactionLogsTable.eventId, user.eventId));
        if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
        if (locationId) conditions.push(eq(transactionLogsTable.locationId, locationId));
      }
    } else if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json(emptyRevenue);
        return;
      }
      if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
      conditions.push(eq(transactionLogsTable.merchantId, user.merchantId));
      if (locationId) {
        const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
        if (!loc || loc.merchantId !== user.merchantId) {
          res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
          return;
        }
        conditions.push(eq(transactionLogsTable.locationId, locationId));
      }
    } else {
      if (promoterCompanyId) {
        const companyEventIds = await getEventIdsByPromoterCompany(promoterCompanyId);
        if (companyEventIds.length === 0) {
          res.json(emptyRevenue);
          return;
        }
        topUpEventIds = companyEventIds;
        conditions.push(inArray(transactionLogsTable.eventId, companyEventIds));
      } else if (eventId) {
        topUpEventIds = [eventId];
        conditions.push(eq(transactionLogsTable.eventId, eventId));
      }
      if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
      if (locationId) conditions.push(eq(transactionLogsTable.locationId, locationId));
    }

    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const txRows = await db
      .select()
      .from(transactionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Compute COGS from line items (per-tx map for accurate group-level breakdowns)
    const txIds = txRows.map((r) => r.id);
    let cogs = 0;
    const cogsByTxId = new Map<string, number>();
    const ivaByTxId = new Map<string, number>();
    const retencionFuenteByTxId = new Map<string, number>();
    const retencionICAByTxId = new Map<string, number>();
    if (txIds.length > 0) {
      const lineItemRows = await db
        .select()
        .from(transactionLineItemsTable)
        .where(sql`${transactionLineItemsTable.transactionLogId} = ANY(ARRAY[${sql.join(txIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
      for (const li of lineItemRows) {
        const txCogs = (cogsByTxId.get(li.transactionLogId) ?? 0) + li.unitCostSnapshot * li.quantity;
        cogsByTxId.set(li.transactionLogId, txCogs);
        ivaByTxId.set(li.transactionLogId, (ivaByTxId.get(li.transactionLogId) ?? 0) + li.ivaAmount);
        retencionFuenteByTxId.set(li.transactionLogId, (retencionFuenteByTxId.get(li.transactionLogId) ?? 0) + li.retencionFuenteAmount);
        retencionICAByTxId.set(li.transactionLogId, (retencionICAByTxId.get(li.transactionLogId) ?? 0) + li.retencionICAAmount);
      }
      cogs = [...cogsByTxId.values()].reduce((s, c) => s + c, 0);
    }

    const grossSales = txRows.reduce((s, r) => s + r.grossAmount, 0);
    const totalTips = txRows.reduce((s, r) => s + (r.tipAmount ?? 0), 0);
    const commission = txRows.reduce((s, r) => s + r.commissionAmount, 0);
    const net = txRows.reduce((s, r) => s + r.netAmount, 0);
    const grossProfit = grossSales - cogs;
    const profitMarginPercent = grossSales > 0
      ? Math.round((grossProfit / grossSales) * 10000) / 100
      : 0;
    const totalIva = [...ivaByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetencionFuente = [...retencionFuenteByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetencionICA = [...retencionICAByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetenciones = totalRetencionFuente + totalRetencionICA;
    const totalNeto = grossSales - commission - totalRetenciones;

    const totals = {
      grossSales,
      totalTips,
      cogs,
      grossProfit,
      profitMarginPercent,
      commission,
      net,
      transactionCount: txRows.length,
      totalIva,
      totalRetencionFuente,
      totalRetencionICA,
      totalRetenciones,
      totalNeto,
    };

    // Group by merchant
    const byMerchantMap = new Map<string, {
      merchantId: string;
      merchantName: string;
      rows: typeof txRows;
      byLocation: Map<string, { locationId: string; locationName: string; rows: typeof txRows }>;
    }>();

    for (const tx of txRows) {
      if (!byMerchantMap.has(tx.merchantId)) {
        byMerchantMap.set(tx.merchantId, {
          merchantId: tx.merchantId,
          merchantName: "",
          rows: [],
          byLocation: new Map(),
        });
      }
      const merchantGroup = byMerchantMap.get(tx.merchantId)!;
      merchantGroup.rows.push(tx);

      if (!merchantGroup.byLocation.has(tx.locationId)) {
        merchantGroup.byLocation.set(tx.locationId, {
          locationId: tx.locationId,
          locationName: "",
          rows: [],
        });
      }
      merchantGroup.byLocation.get(tx.locationId)!.rows.push(tx);
    }

    // Fetch merchant and location names
    const merchantIds = [...byMerchantMap.keys()];
    if (merchantIds.length > 0) {
      const merchants = await db.select().from(merchantsTable).where(
        sql`${merchantsTable.id} = ANY(ARRAY[${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
      );
      for (const m of merchants) {
        if (byMerchantMap.has(m.id)) {
          byMerchantMap.get(m.id)!.merchantName = m.name;
        }
      }

      const locationIds: string[] = [];
      for (const mg of byMerchantMap.values()) {
        locationIds.push(...mg.byLocation.keys());
      }
      if (locationIds.length > 0) {
        const locs = await db.select().from(locationsTable).where(
          sql`${locationsTable.id} = ANY(ARRAY[${sql.join(locationIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
        );
        for (const loc of locs) {
          for (const mg of byMerchantMap.values()) {
            if (mg.byLocation.has(loc.id)) {
              mg.byLocation.get(loc.id)!.locationName = loc.name;
            }
          }
        }
      }
    }

    function summarizeRows(rows: typeof txRows) {
      const gross = rows.reduce((s, r) => s + r.grossAmount, 0);
      const tips = rows.reduce((s, r) => s + (r.tipAmount ?? 0), 0);
      const comm = rows.reduce((s, r) => s + r.commissionAmount, 0);
      const net = rows.reduce((s, r) => s + r.netAmount, 0);
      const groupCogs = rows.reduce((s, r) => s + (cogsByTxId.get(r.id) ?? 0), 0);
      const profit = gross - groupCogs;
      const margin = gross > 0 ? Math.round((profit / gross) * 10000) / 100 : 0;
      const groupIva = rows.reduce((s, r) => s + (ivaByTxId.get(r.id) ?? 0), 0);
      const groupRetencionFuente = rows.reduce((s, r) => s + (retencionFuenteByTxId.get(r.id) ?? 0), 0);
      const groupRetencionICA = rows.reduce((s, r) => s + (retencionICAByTxId.get(r.id) ?? 0), 0);
      const groupRetenciones = groupRetencionFuente + groupRetencionICA;
      const groupNeto = gross - comm - groupRetenciones;
      return {
        grossSales: gross,
        totalTips: tips,
        cogs: groupCogs,
        grossProfit: profit,
        profitMarginPercent: margin,
        commission: comm,
        net: net,
        transactionCount: rows.length,
        totalIva: groupIva,
        totalRetencionFuente: groupRetencionFuente,
        totalRetencionICA: groupRetencionICA,
        totalRetenciones: groupRetenciones,
        totalNeto: groupNeto,
      };
    }

    const byMerchant = [...byMerchantMap.values()].map((mg) => ({
      merchantId: mg.merchantId,
      merchantName: mg.merchantName,
      data: summarizeRows(mg.rows),
      byLocation: [...mg.byLocation.values()].map((lg) => ({
        locationId: lg.locationId,
        locationName: lg.locationName,
        data: summarizeRows(lg.rows),
      })),
    }));

    let totalTopUps = 0;
    let topUpCount = 0;
    let braceletCount = 0;
    if (topUpEventIds !== null && topUpEventIds.length > 0) {
      const eventTopUps = await getTopUpsForEventIds(topUpEventIds, from, to);
      totalTopUps = eventTopUps.reduce((s, t) => s + t.amount, 0);
      topUpCount = eventTopUps.length;
      const [bAgg] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(braceletsTable)
        .where(inArray(braceletsTable.eventId, topUpEventIds));
      braceletCount = bAgg?.count ?? 0;
    } else if (topUpEventIds === null && user.role === "admin") {
      const topUpConditions = [eq(topUpsTable.status, "completed")];
      if (from) topUpConditions.push(gte(topUpsTable.createdAt, new Date(from)));
      if (to) topUpConditions.push(lte(topUpsTable.createdAt, new Date(to)));
      const allTopUps = await db.select().from(topUpsTable).where(and(...topUpConditions));
      totalTopUps = allTopUps.reduce((s, t) => s + t.amount, 0);
      topUpCount = allTopUps.length;
      const braceletConditions = [];
      if (from) braceletConditions.push(gte(braceletsTable.createdAt, new Date(from)));
      if (to) braceletConditions.push(lte(braceletsTable.createdAt, new Date(to)));
      const [bAgg] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(braceletsTable)
        .where(braceletConditions.length > 0 ? and(...braceletConditions) : undefined);
      braceletCount = bAgg?.count ?? 0;
    }

    res.json({
      totalSales: totals.grossSales,
      totalCogs: totals.cogs,
      grossProfit: totals.grossProfit,
      totalCommissions: totals.commission,
      platformRevenue: totals.commission,
      netOwedToMerchants: totals.net,
      transactionCount: totals.transactionCount,
      totalTopUps,
      topUpCount,
      braceletCount,
      totals,
      byMerchant,
    });
  },
);

async function getTopUpsForEventIds(eventIds: string[], from?: string, to?: string) {
  const bracelets = await db
    .select({ nfcUid: braceletsTable.nfcUid })
    .from(braceletsTable)
    .where(inArray(braceletsTable.eventId, eventIds));
  const braceletUids = bracelets.map((b) => b.nfcUid);
  if (braceletUids.length === 0) return [];
  const topUpConditions = [
    inArray(topUpsTable.braceletUid, braceletUids),
    eq(topUpsTable.status, "completed"),
  ];
  if (from) topUpConditions.push(gte(topUpsTable.createdAt, new Date(from)));
  if (to) topUpConditions.push(lte(topUpsTable.createdAt, new Date(to)));
  return db.select().from(topUpsTable).where(and(...topUpConditions));
}

router.get(
  "/reports/topups",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { from, to, promoterCompanyId, eventId } = req.query as { from?: string; to?: string; promoterCompanyId?: string; eventId?: string };
    const user = req.user!;

    const DIGITAL_PAYMENT_METHODS = new Set(["nequi_transfer", "bancolombia_transfer", "nequi", "pse"]);

    type TopUpRow = typeof topUpsTable.$inferSelect;
    const buildTopUpSummary = async (topUps: TopUpRow[]) => {
      const total = topUps.reduce((s, t) => s + t.amount, 0);
      const totalCount = topUps.length;
      const averageAmount = totalCount > 0 ? Math.round(total / totalCount) : 0;
      const uniqueBraceletsCount = new Set(topUps.map((t) => t.braceletUid)).size;
      const byPaymentMethod: Record<string, number> = {};
      const byUserMap = new Map<string, { total: number; count: number }>();
      let bankTotal = 0;
      let bankCount = 0;
      let digitalTotal = 0;
      let digitalCount = 0;
      for (const t of topUps) {
        byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] ?? 0) + t.amount;
        if (!byUserMap.has(t.performedByUserId)) byUserMap.set(t.performedByUserId, { total: 0, count: 0 });
        const u = byUserMap.get(t.performedByUserId)!;
        u.total += t.amount; u.count += 1;
        if (DIGITAL_PAYMENT_METHODS.has(t.paymentMethod) && t.wompiTransactionId) {
          digitalTotal += t.amount;
          digitalCount += 1;
        } else {
          bankTotal += t.amount;
          bankCount += 1;
        }
      }
      const userIds = [...byUserMap.keys()];
      const users = userIds.length > 0 ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
      const byUser = userIds.map((uid) => {
        const usr = users.find((u) => u.id === uid);
        const data = byUserMap.get(uid)!;
        return { userId: uid, firstName: usr?.firstName ?? null, lastName: usr?.lastName ?? null, total: data.total, count: data.count };
      });
      const bySource = {
        bank: { total: bankTotal, count: bankCount },
        digital: { total: digitalTotal, count: digitalCount },
      };
      return { total, totalAmount: total, totalCount, averageAmount, uniqueBraceletsCount, byPaymentMethod, byUser, bySource };
    };

    // event_admin: scope top-ups to their event via bracelet.eventId
    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      if (userCompanyId) {
        const companyEventIds = await getEventIdsByPromoterCompany(userCompanyId);
        if (companyEventIds.length === 0) {
          res.json({ total: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { total: 0, count: 0 }, digital: { total: 0, count: 0 } } });
          return;
        }
        const topUps = await getTopUpsForEventIds(companyEventIds, from, to);
        res.json(await buildTopUpSummary(topUps));
        return;
      }
      if (!user.eventId) {
        res.json({ total: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { total: 0, count: 0 }, digital: { total: 0, count: 0 } } });
        return;
      }
      const eventBracelets = await db
        .select({ nfcUid: braceletsTable.nfcUid })
        .from(braceletsTable)
        .where(eq(braceletsTable.eventId, user.eventId));
      const braceletUids = eventBracelets.map((b) => b.nfcUid);
      if (braceletUids.length === 0) {
        res.json({ total: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { total: 0, count: 0 }, digital: { total: 0, count: 0 } } });
        return;
      }
      const topUpConditions = [
        inArray(topUpsTable.braceletUid, braceletUids),
        eq(topUpsTable.status, "completed"),
      ];
      if (from) topUpConditions.push(gte(topUpsTable.createdAt, new Date(from)));
      if (to) topUpConditions.push(lte(topUpsTable.createdAt, new Date(to)));
      const topUps = await db.select().from(topUpsTable).where(and(...topUpConditions));
      res.json(await buildTopUpSummary(topUps));
      return;
    }

    if (eventId) {
      const topUps = await getTopUpsForEventIds([eventId], from, to);
      res.json(await buildTopUpSummary(topUps));
      return;
    }

    if (promoterCompanyId) {
      const companyEventIds = await getEventIdsByPromoterCompany(promoterCompanyId);
      if (companyEventIds.length === 0) {
        res.json({ total: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { total: 0, count: 0 }, digital: { total: 0, count: 0 } } });
        return;
      }
      const topUps = await getTopUpsForEventIds(companyEventIds, from, to);
      res.json(await buildTopUpSummary(topUps));
      return;
    }

    const conditions = [eq(topUpsTable.status, "completed")];
    if (from) conditions.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(topUpsTable.createdAt, new Date(to)));

    const topUps = await db
      .select()
      .from(topUpsTable)
      .where(and(...conditions));

    res.json(await buildTopUpSummary(topUps));
  },
);

router.get(
  "/reports/inventory",
  requireRole("admin", "warehouse_admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, locationId } = req.query as { eventId?: string; locationId?: string };
    const user = req.user!;

    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ items: [] });
        return;
      }
      const scopedEventId = user.eventId;
      const eventMerchants = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.eventId, scopedEventId));
      const merchantIds = eventMerchants.map((m) => m.id);
      if (merchantIds.length === 0) { res.json({ items: [] }); return; }
      const eventLocations = await db.select({ id: locationsTable.id, name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.eventId, scopedEventId));
      const locationIds = eventLocations.map((l) => l.id);
      if (locationIds.length === 0) { res.json({ items: [] }); return; }
      const filteredLocationIds = locationId ? locationIds.filter((id) => id === locationId) : locationIds;
      if (filteredLocationIds.length === 0) { res.json({ items: [] }); return; }
      const items = await db.select({
        id: locationInventoryTable.id,
        locationId: locationInventoryTable.locationId,
        productId: locationInventoryTable.productId,
        quantityOnHand: locationInventoryTable.quantityOnHand,
        restockTrigger: locationInventoryTable.restockTrigger,
      }).from(locationInventoryTable).where(inArray(locationInventoryTable.locationId, filteredLocationIds));
      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = productIds.length > 0 ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds)) : [];
      const report = items.map((item) => {
        const loc = eventLocations.find((l) => l.id === item.locationId);
        const prod = products.find((p) => p.id === item.productId);
        return { locationId: item.locationId, locationName: loc?.name ?? item.locationId, productId: item.productId, productName: prod?.name ?? item.productId, price: prod?.price ?? 0, quantityOnHand: item.quantityOnHand, restockTrigger: item.restockTrigger, isLowStock: item.quantityOnHand <= item.restockTrigger };
      });
      const totalUnitsInStock = report.reduce((s, i) => s + i.quantityOnHand, 0);
      const totalInventoryValue = report.reduce((s, i) => s + i.quantityOnHand * i.price, 0);
      const lowStockCount = report.filter((i) => i.isLowStock).length;

      const [eventTzRow] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, scopedEventId));
      const eventTz = eventTzRow?.timezone ?? "UTC";
      const [soldTodayAgg] = await db
        .select({ units: sql<number>`COALESCE(SUM(${transactionLineItemsTable.quantity}), 0)`.mapWith(Number) })
        .from(transactionLineItemsTable)
        .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
        .where(and(
          eq(transactionLogsTable.eventId, scopedEventId),
          sql`DATE(${transactionLogsTable.createdAt} AT TIME ZONE ${eventTz}) = CURRENT_DATE AT TIME ZONE ${eventTz}`,
        ));
      res.json({ items: report, totalUnitsInStock, totalInventoryValue, lowStockCount, unitsSoldToday: soldTodayAgg?.units ?? 0 });
      return;
    }

    if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json({ items: [] });
        return;
      }
      if (locationId) {
        const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
        if (!loc || loc.merchantId !== user.merchantId) {
          res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
          return;
        }
      }
    }

    void eventId;

    const conditions = [];
    if (locationId) {
      conditions.push(eq(locationInventoryTable.locationId, locationId));
    } else if (user.role === "merchant_admin" && user.merchantId) {
      const merchantLocations = await db
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.merchantId, user.merchantId));
      const locationIds = merchantLocations.map((l) => l.id);
      if (locationIds.length === 0) {
        res.json({ items: [] });
        return;
      }
      conditions.push(inArray(locationInventoryTable.locationId, locationIds));
    }

    const items = await db
      .select({
        id: locationInventoryTable.id,
        locationId: locationInventoryTable.locationId,
        productId: locationInventoryTable.productId,
        quantityOnHand: locationInventoryTable.quantityOnHand,
        restockTrigger: locationInventoryTable.restockTrigger,
      })
      .from(locationInventoryTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const locationIds = [...new Set(items.map((i) => i.locationId))];
    const productIds = [...new Set(items.map((i) => i.productId))];

    const locations = locationIds.length > 0
      ? await db.select().from(locationsTable).where(
          sql`${locationsTable.id} = ANY(ARRAY[${sql.join(locationIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
        )
      : [];
    const products = productIds.length > 0
      ? await db.select().from(productsTable).where(
          sql`${productsTable.id} = ANY(ARRAY[${sql.join(productIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
        )
      : [];

    const report = items.map((item) => {
      const loc = locations.find((l) => l.id === item.locationId);
      const prod = products.find((p) => p.id === item.productId);
      return {
        locationId: item.locationId,
        locationName: loc?.name ?? item.locationId,
        productId: item.productId,
        productName: prod?.name ?? item.productId,
        price: prod?.price ?? 0,
        quantityOnHand: item.quantityOnHand,
        restockTrigger: item.restockTrigger,
        isLowStock: item.quantityOnHand <= item.restockTrigger,
      };
    });

    const totalUnitsInStock = report.reduce((s, i) => s + i.quantityOnHand, 0);
    const totalInventoryValue = report.reduce((s, i) => s + i.quantityOnHand * i.price, 0);
    const lowStockCount = report.filter((i) => i.isLowStock).length;

    const reportedLocationIds = report.map((i) => i.locationId);
    let unitsSoldToday = 0;
    if (reportedLocationIds.length > 0) {
      let genEventTz = "UTC";
      if (eventId) {
        const [evTzRow] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventId));
        if (evTzRow?.timezone) genEventTz = evTzRow.timezone;
      }
      const soldTodayConds = [
        inArray(transactionLogsTable.locationId, reportedLocationIds),
        sql`DATE(${transactionLogsTable.createdAt} AT TIME ZONE ${genEventTz}) = CURRENT_DATE AT TIME ZONE ${genEventTz}`,
      ];
      if (eventId) soldTodayConds.push(eq(transactionLogsTable.eventId, eventId));
      const [soldTodayAggGen] = await db
        .select({ units: sql<number>`COALESCE(SUM(${transactionLineItemsTable.quantity}), 0)`.mapWith(Number) })
        .from(transactionLineItemsTable)
        .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
        .where(and(...soldTodayConds));
      unitsSoldToday = soldTodayAggGen?.units ?? 0;
    }

    const recentAudits = await db
      .select({
        id: inventoryAuditsTable.id,
        warehouseId: inventoryAuditsTable.warehouseId,
        locationId: inventoryAuditsTable.locationId,
        performedByUserId: inventoryAuditsTable.performedByUserId,
        notes: inventoryAuditsTable.notes,
        createdAt: inventoryAuditsTable.createdAt,
      })
      .from(inventoryAuditsTable)
      .orderBy(desc(inventoryAuditsTable.createdAt))
      .limit(50);

    const recentDamagedGoods = await db
      .select({
        id: damagedGoodsTable.id,
        productId: damagedGoodsTable.productId,
        quantity: damagedGoodsTable.quantity,
        reason: damagedGoodsTable.reason,
        notes: damagedGoodsTable.notes,
        performedByUserId: damagedGoodsTable.performedByUserId,
        createdAt: damagedGoodsTable.createdAt,
        productName: productsTable.name,
      })
      .from(damagedGoodsTable)
      .leftJoin(productsTable, eq(damagedGoodsTable.productId, productsTable.id))
      .orderBy(desc(damagedGoodsTable.createdAt))
      .limit(50);

    void inventoryAuditItemsTable;

    res.json({ items: report, totalUnitsInStock, totalInventoryValue, lowStockCount, unitsSoldToday, recentAudits, recentDamagedGoods });
  },
);

router.post(
  "/admin/tamper-report",
  requireRole("admin", "bank", "merchant_staff", "merchant_admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      nfcUid: z.string().min(1),
      reason: z.string().optional(),
      context: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { nfcUid, reason } = parsed.data;
    const user = req.user as AuthUser | undefined;

    // Flag the bracelet
    await db
      .update(braceletsTable)
      .set({ flagged: true, flagReason: reason ?? "HMAC verification failed", updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, nfcUid));

    // Also create a fraud alert so event_admin is notified immediately
    const [bracelet] = await db
      .select({ eventId: braceletsTable.eventId })
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    if (bracelet?.eventId) {
      void createAlert({
        eventId: bracelet.eventId,
        type: "hmac_invalid",
        severity: "critical",
        entityType: "bracelet",
        entityId: nfcUid,
        description: `HMAC verification failed for bracelet ${nfcUid}. Bracelet has been quarantined automatically. Reason: ${reason ?? "HMAC mismatch detected at merchant POS"}.`,
        reportedBy: user?.id ?? null,
      });
    }

    res.json({ success: true });
  },
);

router.get(
  "/admin/snapshot",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.query as { eventId?: string };
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const merchants = await db.select().from(merchantsTable).where(eq(merchantsTable.eventId, eventId));
    const transactions = await db.select().from(transactionLogsTable).where(eq(transactionLogsTable.eventId, eventId));
    const topUps = await db.select().from(topUpsTable).where(
      sql`${topUpsTable.braceletUid} IN (SELECT nfc_uid FROM bracelets WHERE event_id = ${eventId})`,
    );
    const payouts = await db.select().from(merchantPayoutsTable).where(eq(merchantPayoutsTable.eventId, eventId));

    res.json({
      eventId,
      exportedAt: new Date().toISOString(),
      event,
      merchants,
      transactions,
      topUps,
      payouts,
    });
  },
);

router.get(
  "/reports/billing",
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    const events = await db.select().from(eventsTable);

    const billingRows = await Promise.all(
      events.map(async (event) => {
        const txRows = await db
          .select()
          .from(transactionLogsTable)
          .where(eq(transactionLogsTable.eventId, event.id));

        const totalSales = txRows.reduce((s, r) => s + r.grossAmount, 0);
        const commissionRate = parseFloat(event.platformCommissionRate as unknown as string) || 0;
        const platformCommissionEarned = Math.round(totalSales * (commissionRate / 100));

        return {
          eventId: event.id,
          eventName: event.name,
          platformCommissionRate: commissionRate,
          totalSales,
          platformCommissionEarned,
        };
      }),
    );

    res.json({ billing: billingRows });
  },
);

router.get(
  "/reports/fiscal-summary",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, merchantId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const conditions: ReturnType<typeof eq>[] = [];

    if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json({ byMerchant: [] });
        return;
      }
      conditions.push(eq(transactionLogsTable.merchantId, user.merchantId));
      if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
    } else if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ byMerchant: [] });
        return;
      }
      conditions.push(eq(transactionLogsTable.eventId, user.eventId));
      if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
    } else {
      if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
      if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
    }

    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const txRows = await db
      .select()
      .from(transactionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const txIds = txRows.map((r) => r.id);
    const liByTxId = new Map<string, { iva: number; fuente: number; ica: number }>();

    if (txIds.length > 0) {
      const lineItems = await db
        .select()
        .from(transactionLineItemsTable)
        .where(sql`${transactionLineItemsTable.transactionLogId} = ANY(ARRAY[${sql.join(txIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
      for (const li of lineItems) {
        const cur = liByTxId.get(li.transactionLogId) ?? { iva: 0, fuente: 0, ica: 0 };
        cur.iva += li.ivaAmount;
        cur.fuente += li.retencionFuenteAmount;
        cur.ica += li.retencionICAAmount;
        liByTxId.set(li.transactionLogId, cur);
      }
    }

    const byMerchantMap = new Map<string, {
      merchantId: string;
      merchantName: string;
      rows: typeof txRows;
    }>();

    for (const tx of txRows) {
      if (!byMerchantMap.has(tx.merchantId)) {
        byMerchantMap.set(tx.merchantId, { merchantId: tx.merchantId, merchantName: "", rows: [] });
      }
      byMerchantMap.get(tx.merchantId)!.rows.push(tx);
    }

    const merchantIds = [...byMerchantMap.keys()];
    if (merchantIds.length > 0) {
      const merchants = await db.select().from(merchantsTable).where(
        sql`${merchantsTable.id} = ANY(ARRAY[${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
      );
      for (const m of merchants) {
        if (byMerchantMap.has(m.id)) byMerchantMap.get(m.id)!.merchantName = m.name;
      }
    }

    const byMerchant = [...byMerchantMap.values()].map((mg) => {
      const totalBruto = mg.rows.reduce((s, r) => s + r.grossAmount, 0);
      const totalTips = mg.rows.reduce((s, r) => s + (r.tipAmount ?? 0), 0);
      const totalComision = mg.rows.reduce((s, r) => s + r.commissionAmount, 0);
      const totalIva = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.iva ?? 0), 0);
      const totalRetencionFuente = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.fuente ?? 0), 0);
      const totalRetencionICA = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.ica ?? 0), 0);
      const totalRetenciones = totalRetencionFuente + totalRetencionICA;
      const totalNeto = totalBruto - totalComision - totalRetenciones;
      return {
        merchantId: mg.merchantId,
        merchantName: mg.merchantName,
        transactionCount: mg.rows.length,
        totalBruto,
        totalTips,
        totalIva,
        totalRetencionFuente,
        totalRetencionICA,
        totalRetenciones,
        totalComision,
        totalNeto,
      };
    });

    const grandTotals = byMerchant.reduce(
      (acc, m) => ({
        totalBruto: acc.totalBruto + m.totalBruto,
        totalTips: acc.totalTips + m.totalTips,
        totalIva: acc.totalIva + m.totalIva,
        totalRetencionFuente: acc.totalRetencionFuente + m.totalRetencionFuente,
        totalRetencionICA: acc.totalRetencionICA + m.totalRetencionICA,
        totalRetenciones: acc.totalRetenciones + m.totalRetenciones,
        totalComision: acc.totalComision + m.totalComision,
        totalNeto: acc.totalNeto + m.totalNeto,
      }),
      { totalBruto: 0, totalTips: 0, totalIva: 0, totalRetencionFuente: 0, totalRetencionICA: 0, totalRetenciones: 0, totalComision: 0, totalNeto: 0 },
    );

    res.json({ totals: grandTotals, byMerchant });
  },
);

router.get(
  "/reports/float",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const empty = { totalLoaded: 0, totalSpent: 0, unclaimed: 0, utilizationRate: 0, braceletsWithBalance: 0, uniqueBracelets: 0 };

    let scopedEventId: string | null = null;
    if (user.role === "event_admin") {
      if (!user.eventId) { res.json(empty); return; }
      scopedEventId = user.eventId;
    } else {
      scopedEventId = eventId ?? null;
    }

    // Resolve bracelet UIDs for this event so we can filter top-ups
    let topUpBraceletUids: string[] | null = null;
    if (scopedEventId) {
      const bracelets = await db.select({ nfcUid: braceletsTable.nfcUid }).from(braceletsTable).where(eq(braceletsTable.eventId, scopedEventId));
      topUpBraceletUids = bracelets.map((b) => b.nfcUid);
      if (topUpBraceletUids.length === 0) { res.json(empty); return; }
    }

    const topUpConds = [eq(topUpsTable.status, "completed")];
    if (topUpBraceletUids && topUpBraceletUids.length > 0) topUpConds.push(inArray(topUpsTable.braceletUid, topUpBraceletUids));
    if (from) topUpConds.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) topUpConds.push(lte(topUpsTable.createdAt, new Date(to)));

    const txConds = [];
    if (scopedEventId) txConds.push(eq(transactionLogsTable.eventId, scopedEventId));
    if (from) txConds.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) txConds.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const [[topUpAgg], [txAgg], [balAgg]] = await Promise.all([
      db.select({
        totalLoaded: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number),
        uniqueBracelets: sql<number>`COUNT(DISTINCT ${topUpsTable.braceletUid})`.mapWith(Number),
      }).from(topUpsTable).where(and(...topUpConds)),
      db.select({
        totalSpent: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount} + COALESCE(${transactionLogsTable.tipAmount}, 0)), 0)`.mapWith(Number),
      }).from(transactionLogsTable).where(txConds.length > 0 ? and(...txConds) : undefined),
      db.select({
        unclaimed: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalance}), 0)`.mapWith(Number),
        braceletsWithBalance: sql<number>`COUNT(*) FILTER (WHERE ${braceletsTable.lastKnownBalance} > 0)`.mapWith(Number),
      }).from(braceletsTable).where(scopedEventId ? eq(braceletsTable.eventId, scopedEventId) : undefined),
    ]);

    const totalLoaded = topUpAgg?.totalLoaded ?? 0;
    const totalSpent = txAgg?.totalSpent ?? 0;
    const unclaimed = balAgg?.unclaimed ?? 0;
    const utilizationRate = totalLoaded > 0 ? Math.round((totalSpent / totalLoaded) * 100) : 0;

    res.json({ totalLoaded, totalSpent, unclaimed, utilizationRate, braceletsWithBalance: balAgg?.braceletsWithBalance ?? 0, uniqueBracelets: topUpAgg?.uniqueBracelets ?? 0 });
  },
);

router.get(
  "/reports/sales-heatmap",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const emptyHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, totalAmount: 0, transactionCount: 0 }));
    const empty = { byHour: emptyHours };

    let scopedEventId: string | null = null;
    if (user.role === "event_admin") {
      if (!user.eventId) { res.json(empty); return; }
      scopedEventId = user.eventId;
    } else {
      scopedEventId = eventId ?? null;
    }

    let eventTz = "America/Bogota";
    if (scopedEventId) {
      const [evRow] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, scopedEventId));
      eventTz = evRow?.timezone ?? "America/Bogota";
    }

    const conditions = [];
    if (scopedEventId) conditions.push(eq(transactionLogsTable.eventId, scopedEventId));
    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const hourExpr = sql`EXTRACT(HOUR FROM ${transactionLogsTable.createdAt} AT TIME ZONE ${eventTz})::int`;

    const rows = await db
      .select({
        hour: hourExpr.mapWith(Number),
        totalAmount: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
        transactionCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(transactionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`1`);

    const byHourMap = new Map<number, { totalAmount: number; transactionCount: number }>();
    for (const row of rows) byHourMap.set(row.hour, { totalAmount: row.totalAmount, transactionCount: row.transactionCount });

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      ...(byHourMap.get(h) ?? { totalAmount: 0, transactionCount: 0 }),
    }));

    res.json({ byHour });
  },
);

router.get(
  "/reports/topups-heatmap",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const emptyHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, totalAmount: 0, count: 0 }));
    const empty = { byHour: emptyHours };

    let scopedEventId: string | null = null;
    if (user.role === "event_admin") {
      if (!user.eventId) { res.json(empty); return; }
      scopedEventId = user.eventId;
    } else {
      scopedEventId = eventId ?? null;
    }

    let eventTz = "America/Bogota";
    if (scopedEventId) {
      const [evRow] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, scopedEventId));
      eventTz = evRow?.timezone ?? "America/Bogota";
    }

    let braceletUids: string[] | null = null;
    if (scopedEventId) {
      const bs = await db.select({ nfcUid: braceletsTable.nfcUid }).from(braceletsTable).where(eq(braceletsTable.eventId, scopedEventId));
      braceletUids = bs.map((b) => b.nfcUid);
      if (braceletUids.length === 0) { res.json(empty); return; }
    }

    const conditions = [eq(topUpsTable.status, "completed")];
    if (braceletUids && braceletUids.length > 0) conditions.push(inArray(topUpsTable.braceletUid, braceletUids));
    if (from) conditions.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(topUpsTable.createdAt, new Date(to)));

    const hourExpr = sql`EXTRACT(HOUR FROM ${topUpsTable.createdAt} AT TIME ZONE ${eventTz})::int`;

    const rows = await db
      .select({
        hour: hourExpr.mapWith(Number),
        totalAmount: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number),
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(topUpsTable)
      .where(and(...conditions))
      .groupBy(sql`1`);

    const byHourMap = new Map<number, { totalAmount: number; count: number }>();
    for (const row of rows) byHourMap.set(row.hour, { totalAmount: row.totalAmount, count: row.count });

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      ...(byHourMap.get(h) ?? { totalAmount: 0, count: 0 }),
    }));

    res.json({ byHour });
  },
);

router.get(
  "/reports/tips-by-staff",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, merchantId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const empty = { totals: { totalTips: 0, transactionCount: 0 }, byStaff: [] };
    const conditions = [];

    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      if (userCompanyId) {
        const companyEventIds = await getEventIdsByPromoterCompany(userCompanyId);
        if (companyEventIds.length === 0) { res.json(empty); return; }
        conditions.push(inArray(transactionLogsTable.eventId, companyEventIds));
        if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
      } else {
        if (!user.eventId) { res.json(empty); return; }
        conditions.push(eq(transactionLogsTable.eventId, user.eventId));
      }
    } else {
      if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
    }

    if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));
    conditions.push(sql`${transactionLogsTable.tipAmount} > 0`);

    const rows = await db
      .select({
        performedByUserId: transactionLogsTable.performedByUserId,
        merchantId: transactionLogsTable.merchantId,
        totalTips: sql<number>`COALESCE(SUM(${transactionLogsTable.tipAmount}), 0)`.mapWith(Number),
        transactionCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(transactionLogsTable)
      .where(and(...conditions))
      .groupBy(transactionLogsTable.performedByUserId, transactionLogsTable.merchantId);

    if (rows.length === 0) { res.json(empty); return; }

    const userIds = [...new Set(rows.map((r) => r.performedByUserId).filter(Boolean) as string[])];
    const merchantIds = [...new Set(rows.map((r) => r.merchantId).filter(Boolean) as string[])];

    const [staffUsers, staffMerchants] = await Promise.all([
      userIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
      merchantIds.length > 0 ? db.select().from(merchantsTable).where(inArray(merchantsTable.id, merchantIds)) : Promise.resolve([]),
    ]);

    const byStaff = rows
      .map((row) => {
        const usr = staffUsers.find((u) => u.id === row.performedByUserId);
        const merchant = staffMerchants.find((m) => m.id === row.merchantId);
        return {
          userId: row.performedByUserId,
          firstName: usr?.firstName ?? null,
          lastName: usr?.lastName ?? null,
          role: usr?.role ?? null,
          merchantId: row.merchantId,
          merchantName: merchant?.name ?? null,
          totalTips: row.totalTips,
          transactionCount: row.transactionCount,
        };
      })
      .sort((a, b) => b.totalTips - a.totalTips);

    const totalTips = byStaff.reduce((s, r) => s + r.totalTips, 0);
    const transactionCount = byStaff.reduce((s, r) => s + r.transactionCount, 0);

    res.json({ totals: { totalTips, transactionCount }, byStaff });
  },
);

router.get(
  "/reports/tickets-summary",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const emptyHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    const empty = {
      totals: { ticketsSold: 0, ticketsCheckedIn: 0, checkInRate: 0, ticketRevenue: 0, guestListRegistrations: 0 },
      byType: [] as { ticketTypeId: string | null; ticketTypeName: string; price: number; sold: number; checkedIn: number }[],
      guestLists: [] as { id: string; name: string; maxGuests: number; currentCount: number; status: string }[],
      checkInsByHour: emptyHours,
    };

    let scopedEventId: string | null = null;
    if (user.role === "event_admin") {
      if (!user.eventId) { res.json(empty); return; }
      scopedEventId = user.eventId;
    } else {
      scopedEventId = eventId ?? null;
    }

    if (!scopedEventId) { res.json(empty); return; }

    let eventTz = "America/Bogota";
    const [evRow] = await db.select({ timezone: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, scopedEventId));
    if (evRow?.timezone) eventTz = evRow.timezone;

    const ticketConds = [
      eq(ticketsTable.eventId, scopedEventId),
      inArray(ticketsTable.status, ["valid", "used"]),
    ];
    if (from) ticketConds.push(gte(ticketsTable.createdAt, new Date(from)));
    if (to) ticketConds.push(lte(ticketsTable.createdAt, new Date(to)));

    const orderConds = [
      eq(ticketOrdersTable.eventId, scopedEventId),
      eq(ticketOrdersTable.paymentStatus, "confirmed"),
    ];
    if (from) orderConds.push(gte(ticketOrdersTable.createdAt, new Date(from)));
    if (to) orderConds.push(lte(ticketOrdersTable.createdAt, new Date(to)));

    const hourExpr = sql`EXTRACT(HOUR FROM ${ticketCheckInsTable.checkedInAt} AT TIME ZONE ${eventTz})::int`;

    const [ticketRows, typeRows, checkinRows, revenueAggRows, guestListRows, checkInHourRows] = await Promise.all([
      db.select({ id: ticketsTable.id, ticketTypeId: ticketsTable.ticketTypeId })
        .from(ticketsTable).where(and(...ticketConds)),
      db.select({ id: ticketTypesTable.id, name: ticketTypesTable.name, price: ticketTypesTable.price })
        .from(ticketTypesTable).where(eq(ticketTypesTable.eventId, scopedEventId)),
      db.select({ ticketId: ticketCheckInsTable.ticketId })
        .from(ticketCheckInsTable)
        .innerJoin(ticketsTable, eq(ticketCheckInsTable.ticketId, ticketsTable.id))
        .where(eq(ticketsTable.eventId, scopedEventId)),
      db.select({ revenue: sql<number>`COALESCE(SUM(${ticketOrdersTable.totalAmount}), 0)`.mapWith(Number) })
        .from(ticketOrdersTable).where(and(...orderConds)),
      db.select({ id: guestListsTable.id, name: guestListsTable.name, maxGuests: guestListsTable.maxGuests, currentCount: guestListsTable.currentCount, status: guestListsTable.status })
        .from(guestListsTable).where(eq(guestListsTable.eventId, scopedEventId)),
      db.select({ hour: hourExpr.mapWith(Number), count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(ticketCheckInsTable)
        .innerJoin(ticketsTable, eq(ticketCheckInsTable.ticketId, ticketsTable.id))
        .where(eq(ticketsTable.eventId, scopedEventId))
        .groupBy(sql`1`),
    ]);

    const checkedInIds = new Set(checkinRows.map((r) => r.ticketId));
    const soldByType = new Map<string, number>();
    const checkedByType = new Map<string, number>();

    for (const t of ticketRows) {
      const key = t.ticketTypeId ?? "__none__";
      soldByType.set(key, (soldByType.get(key) ?? 0) + 1);
      if (checkedInIds.has(t.id)) {
        checkedByType.set(key, (checkedByType.get(key) ?? 0) + 1);
      }
    }

    const byType = typeRows.map((tt) => ({
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      price: tt.price,
      sold: soldByType.get(tt.id) ?? 0,
      checkedIn: checkedByType.get(tt.id) ?? 0,
    }));

    const untypedSold = soldByType.get("__none__") ?? 0;
    if (untypedSold > 0) {
      byType.push({ ticketTypeId: null, ticketTypeName: "Lista de invitados", price: 0, sold: untypedSold, checkedIn: checkedByType.get("__none__") ?? 0 });
    }

    const ticketsSold = ticketRows.length;
    const ticketsCheckedIn = ticketRows.filter((t) => checkedInIds.has(t.id)).length;
    const checkInRate = ticketsSold > 0 ? Math.round((ticketsCheckedIn / ticketsSold) * 100) : 0;
    const guestListRegistrations = guestListRows.reduce((s, gl) => s + gl.currentCount, 0);

    const checkInsByHourMap = new Map(checkInHourRows.map((r) => [r.hour, r.count]));
    const checkInsByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: checkInsByHourMap.get(h) ?? 0 }));

    res.json({
      totals: { ticketsSold, ticketsCheckedIn, checkInRate, ticketRevenue: revenueAggRows[0]?.revenue ?? 0, guestListRegistrations },
      byType,
      guestLists: guestListRows,
      checkInsByHour,
    });
  },
);

export default router;

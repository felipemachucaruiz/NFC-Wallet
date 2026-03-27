import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionLogsTable, transactionLineItemsTable, topUpsTable, merchantsTable, locationsTable, locationInventoryTable, productsTable, merchantPayoutsTable, braceletsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
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

    const emptyRevenue = { totalSalesCop: 0, totalCogsCop: 0, grossProfitCop: 0, totalCommissionsCop: 0, netOwedToMerchantsCop: 0, transactionCount: 0, totalTopUpsCop: 0, topUpCount: 0, braceletCount: 0, totals: { grossSalesCop: 0, cogsCop: 0, grossProfitCop: 0, profitMarginPercent: 0, commissionCop: 0, netCop: 0, transactionCount: 0 }, byMerchant: [] };

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
    let cogsCop = 0;
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
        ivaByTxId.set(li.transactionLogId, (ivaByTxId.get(li.transactionLogId) ?? 0) + li.ivaAmountCop);
        retencionFuenteByTxId.set(li.transactionLogId, (retencionFuenteByTxId.get(li.transactionLogId) ?? 0) + li.retencionFuenteAmountCop);
        retencionICAByTxId.set(li.transactionLogId, (retencionICAByTxId.get(li.transactionLogId) ?? 0) + li.retencionICAAmountCop);
      }
      cogsCop = [...cogsByTxId.values()].reduce((s, c) => s + c, 0);
    }

    const grossSalesCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);
    const commissionCop = txRows.reduce((s, r) => s + r.commissionAmountCop, 0);
    const netCop = txRows.reduce((s, r) => s + r.netAmountCop, 0);
    const grossProfitCop = grossSalesCop - cogsCop;
    const profitMarginPercent = grossSalesCop > 0
      ? Math.round((grossProfitCop / grossSalesCop) * 10000) / 100
      : 0;
    const totalIvaCop = [...ivaByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetencionFuenteCop = [...retencionFuenteByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetencionICACop = [...retencionICAByTxId.values()].reduce((s, v) => s + v, 0);
    const totalRetencionesCop = totalRetencionFuenteCop + totalRetencionICACop;
    const totalNetoCop = grossSalesCop - commissionCop - totalRetencionesCop;

    const totals = {
      grossSalesCop,
      cogsCop,
      grossProfitCop,
      profitMarginPercent,
      commissionCop,
      netCop,
      transactionCount: txRows.length,
      totalIvaCop,
      totalRetencionFuenteCop,
      totalRetencionICACop,
      totalRetencionesCop,
      totalNetoCop,
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
      const gross = rows.reduce((s, r) => s + r.grossAmountCop, 0);
      const comm = rows.reduce((s, r) => s + r.commissionAmountCop, 0);
      const net = rows.reduce((s, r) => s + r.netAmountCop, 0);
      const groupCogs = rows.reduce((s, r) => s + (cogsByTxId.get(r.id) ?? 0), 0);
      const profit = gross - groupCogs;
      const margin = gross > 0 ? Math.round((profit / gross) * 10000) / 100 : 0;
      const groupIva = rows.reduce((s, r) => s + (ivaByTxId.get(r.id) ?? 0), 0);
      const groupRetencionFuente = rows.reduce((s, r) => s + (retencionFuenteByTxId.get(r.id) ?? 0), 0);
      const groupRetencionICA = rows.reduce((s, r) => s + (retencionICAByTxId.get(r.id) ?? 0), 0);
      const groupRetenciones = groupRetencionFuente + groupRetencionICA;
      const groupNeto = gross - comm - groupRetenciones;
      return {
        grossSalesCop: gross,
        cogsCop: groupCogs,
        grossProfitCop: profit,
        profitMarginPercent: margin,
        commissionCop: comm,
        netCop: net,
        transactionCount: rows.length,
        totalIvaCop: groupIva,
        totalRetencionFuenteCop: groupRetencionFuente,
        totalRetencionICACop: groupRetencionICA,
        totalRetencionesCop: groupRetenciones,
        totalNetoCop: groupNeto,
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

    let totalTopUpsCop = 0;
    let topUpCount = 0;
    let braceletCount = 0;
    if (topUpEventIds !== null && topUpEventIds.length > 0) {
      const eventTopUps = await getTopUpsForEventIds(topUpEventIds, from, to);
      totalTopUpsCop = eventTopUps.reduce((s, t) => s + t.amountCop, 0);
      topUpCount = eventTopUps.length;
      const [bAgg] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(braceletsTable)
        .where(inArray(braceletsTable.eventId, topUpEventIds));
      braceletCount = bAgg?.count ?? 0;
    }

    res.json({
      totalSalesCop: totals.grossSalesCop,
      totalCogsCop: totals.cogsCop,
      grossProfitCop: totals.grossProfitCop,
      totalCommissionsCop: totals.commissionCop,
      netOwedToMerchantsCop: totals.netCop,
      transactionCount: totals.transactionCount,
      totalTopUpsCop,
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
  const topUpConditions = [inArray(topUpsTable.braceletUid, braceletUids)];
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
      const totalCop = topUps.reduce((s, t) => s + t.amountCop, 0);
      const totalCount = topUps.length;
      const averageAmountCop = totalCount > 0 ? Math.round(totalCop / totalCount) : 0;
      const uniqueBraceletsCount = new Set(topUps.map((t) => t.braceletUid)).size;
      const byPaymentMethod: Record<string, number> = {};
      const byUserMap = new Map<string, { totalCop: number; count: number }>();
      let bankTotalCop = 0;
      let bankCount = 0;
      let digitalTotalCop = 0;
      let digitalCount = 0;
      for (const t of topUps) {
        byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] ?? 0) + t.amountCop;
        if (!byUserMap.has(t.performedByUserId)) byUserMap.set(t.performedByUserId, { totalCop: 0, count: 0 });
        const u = byUserMap.get(t.performedByUserId)!;
        u.totalCop += t.amountCop; u.count += 1;
        if (DIGITAL_PAYMENT_METHODS.has(t.paymentMethod) && t.wompiTransactionId) {
          digitalTotalCop += t.amountCop;
          digitalCount += 1;
        } else {
          bankTotalCop += t.amountCop;
          bankCount += 1;
        }
      }
      const userIds = [...byUserMap.keys()];
      const users = userIds.length > 0 ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
      const byUser = userIds.map((uid) => {
        const usr = users.find((u) => u.id === uid);
        const data = byUserMap.get(uid)!;
        return { userId: uid, firstName: usr?.firstName ?? null, lastName: usr?.lastName ?? null, totalCop: data.totalCop, count: data.count };
      });
      const bySource = {
        bank: { totalCop: bankTotalCop, count: bankCount },
        digital: { totalCop: digitalTotalCop, count: digitalCount },
      };
      return { totalCop, totalAmountCop: totalCop, totalCount, averageAmountCop, uniqueBraceletsCount, byPaymentMethod, byUser, bySource };
    };

    // event_admin: scope top-ups to their event via bracelet.eventId
    if (user.role === "event_admin") {
      const userCompanyId = (user as { promoterCompanyId?: string | null }).promoterCompanyId;
      if (userCompanyId) {
        const companyEventIds = await getEventIdsByPromoterCompany(userCompanyId);
        if (companyEventIds.length === 0) {
          res.json({ totalCop: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { totalCop: 0, count: 0 }, digital: { totalCop: 0, count: 0 } } });
          return;
        }
        const topUps = await getTopUpsForEventIds(companyEventIds, from, to);
        res.json(await buildTopUpSummary(topUps));
        return;
      }
      if (!user.eventId) {
        res.json({ totalCop: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { totalCop: 0, count: 0 }, digital: { totalCop: 0, count: 0 } } });
        return;
      }
      const eventBracelets = await db
        .select({ nfcUid: braceletsTable.nfcUid })
        .from(braceletsTable)
        .where(eq(braceletsTable.eventId, user.eventId));
      const braceletUids = eventBracelets.map((b) => b.nfcUid);
      if (braceletUids.length === 0) {
        res.json({ totalCop: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { totalCop: 0, count: 0 }, digital: { totalCop: 0, count: 0 } } });
        return;
      }
      const topUpConditions = [
        inArray(topUpsTable.braceletUid, braceletUids),
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
        res.json({ totalCop: 0, byPaymentMethod: {}, byUser: [], bySource: { bank: { totalCop: 0, count: 0 }, digital: { totalCop: 0, count: 0 } } });
        return;
      }
      const topUps = await getTopUpsForEventIds(companyEventIds, from, to);
      res.json(await buildTopUpSummary(topUps));
      return;
    }

    const conditions = [];
    if (from) conditions.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(topUpsTable.createdAt, new Date(to)));

    const topUps = await db
      .select()
      .from(topUpsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

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
        return { locationId: item.locationId, locationName: loc?.name ?? item.locationId, productId: item.productId, productName: prod?.name ?? item.productId, priceCop: prod?.priceCop ?? 0, quantityOnHand: item.quantityOnHand, restockTrigger: item.restockTrigger, isLowStock: item.quantityOnHand <= item.restockTrigger };
      });
      const totalUnitsInStock = report.reduce((s, i) => s + i.quantityOnHand, 0);
      const totalInventoryValueCop = report.reduce((s, i) => s + i.quantityOnHand * i.priceCop, 0);
      const lowStockCount = report.filter((i) => i.isLowStock).length;
      res.json({ items: report, totalUnitsInStock, totalInventoryValueCop, lowStockCount, unitsSoldToday: 0 });
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
        priceCop: prod?.priceCop ?? 0,
        quantityOnHand: item.quantityOnHand,
        restockTrigger: item.restockTrigger,
        isLowStock: item.quantityOnHand <= item.restockTrigger,
      };
    });

    const totalUnitsInStock = report.reduce((s, i) => s + i.quantityOnHand, 0);
    const totalInventoryValueCop = report.reduce((s, i) => s + i.quantityOnHand * i.priceCop, 0);
    const lowStockCount = report.filter((i) => i.isLowStock).length;
    res.json({ items: report, totalUnitsInStock, totalInventoryValueCop, lowStockCount, unitsSoldToday: 0 });
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

        const totalSalesCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);
        const commissionRate = parseFloat(event.platformCommissionRate as unknown as string) || 0;
        const platformCommissionEarnedCop = Math.round(totalSalesCop * (commissionRate / 100));

        return {
          eventId: event.id,
          eventName: event.name,
          platformCommissionRate: commissionRate,
          totalSalesCop,
          platformCommissionEarnedCop,
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
        cur.iva += li.ivaAmountCop;
        cur.fuente += li.retencionFuenteAmountCop;
        cur.ica += li.retencionICAAmountCop;
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
      const totalBrutoCop = mg.rows.reduce((s, r) => s + r.grossAmountCop, 0);
      const totalComisionCop = mg.rows.reduce((s, r) => s + r.commissionAmountCop, 0);
      const totalIvaCop = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.iva ?? 0), 0);
      const totalRetencionFuenteCop = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.fuente ?? 0), 0);
      const totalRetencionICACop = mg.rows.reduce((s, r) => s + (liByTxId.get(r.id)?.ica ?? 0), 0);
      const totalRetencionesCop = totalRetencionFuenteCop + totalRetencionICACop;
      const totalNetoCop = totalBrutoCop - totalComisionCop - totalRetencionesCop;
      return {
        merchantId: mg.merchantId,
        merchantName: mg.merchantName,
        transactionCount: mg.rows.length,
        totalBrutoCop,
        totalIvaCop,
        totalRetencionFuenteCop,
        totalRetencionICACop,
        totalRetencionesCop,
        totalComisionCop,
        totalNetoCop,
      };
    });

    const grandTotals = byMerchant.reduce(
      (acc, m) => ({
        totalBrutoCop: acc.totalBrutoCop + m.totalBrutoCop,
        totalIvaCop: acc.totalIvaCop + m.totalIvaCop,
        totalRetencionFuenteCop: acc.totalRetencionFuenteCop + m.totalRetencionFuenteCop,
        totalRetencionICACop: acc.totalRetencionICACop + m.totalRetencionICACop,
        totalRetencionesCop: acc.totalRetencionesCop + m.totalRetencionesCop,
        totalComisionCop: acc.totalComisionCop + m.totalComisionCop,
        totalNetoCop: acc.totalNetoCop + m.totalNetoCop,
      }),
      { totalBrutoCop: 0, totalIvaCop: 0, totalRetencionFuenteCop: 0, totalRetencionICACop: 0, totalRetencionesCop: 0, totalComisionCop: 0, totalNetoCop: 0 },
    );

    res.json({ totals: grandTotals, byMerchant });
  },
);

export default router;

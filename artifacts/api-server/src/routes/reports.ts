import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionLogsTable, transactionLineItemsTable, topUpsTable, merchantsTable, locationsTable, locationInventoryTable, productsTable, merchantPayoutsTable, braceletsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/reports/revenue",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { eventId, merchantId, locationId, from, to } = req.query as Record<string, string | undefined>;
    const user = req.user!;

    const conditions = [];
    if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));

    if (user.role === "merchant_admin") {
      if (!user.merchantId) {
        res.json({ totals: { grossSalesCop: 0, cogsCop: 0, grossProfitCop: 0, profitMarginPercent: 0, commissionCop: 0, netCop: 0, transactionCount: 0 }, byMerchant: [] });
        return;
      }
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
      if (merchantId) conditions.push(eq(transactionLogsTable.merchantId, merchantId));
      if (locationId) conditions.push(eq(transactionLogsTable.locationId, locationId));
    }

    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const txRows = await db
      .select()
      .from(transactionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Compute COGS from line items
    const txIds = txRows.map((r) => r.id);
    let cogsCop = 0;
    if (txIds.length > 0) {
      const lineItemRows = await db
        .select()
        .from(transactionLineItemsTable)
        .where(sql`${transactionLineItemsTable.transactionLogId} = ANY(ARRAY[${sql.join(txIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
      cogsCop = lineItemRows.reduce((s, li) => s + li.unitCostSnapshot * li.quantity, 0);
    }

    const grossSalesCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);
    const commissionCop = txRows.reduce((s, r) => s + r.commissionAmountCop, 0);
    const netCop = txRows.reduce((s, r) => s + r.netAmountCop, 0);
    const grossProfitCop = grossSalesCop - cogsCop;
    const profitMarginPercent = grossSalesCop > 0
      ? Math.round((grossProfitCop / grossSalesCop) * 10000) / 100
      : 0;

    const totals = {
      grossSalesCop,
      cogsCop,
      grossProfitCop,
      profitMarginPercent,
      commissionCop,
      netCop,
      transactionCount: txRows.length,
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
      const profit = gross; // COGS not split per group for performance
      const margin = gross > 0 ? 0 : 0;
      return {
        grossSalesCop: gross,
        cogsCop: 0,
        grossProfitCop: profit,
        profitMarginPercent: margin,
        commissionCop: comm,
        netCop: net,
        transactionCount: rows.length,
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

    res.json({ totals, byMerchant });
  },
);

router.get(
  "/reports/topups",
  requireRole("admin", "bank"),
  async (req: Request, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const conditions = [];
    if (from) conditions.push(gte(topUpsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(topUpsTable.createdAt, new Date(to)));

    const topUps = await db
      .select()
      .from(topUpsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalCop = topUps.reduce((s, t) => s + t.amountCop, 0);
    const byPaymentMethod: Record<string, number> = {};
    const byUserMap = new Map<string, { totalCop: number; count: number }>();

    for (const t of topUps) {
      byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] ?? 0) + t.amountCop;
      if (!byUserMap.has(t.performedByUserId)) {
        byUserMap.set(t.performedByUserId, { totalCop: 0, count: 0 });
      }
      const u = byUserMap.get(t.performedByUserId)!;
      u.totalCop += t.amountCop;
      u.count += 1;
    }

    const userIds = [...byUserMap.keys()];
    const users = userIds.length > 0
      ? await db.select().from(usersTable).where(
          sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
        )
      : [];

    const byUser = userIds.map((uid) => {
      const user = users.find((u) => u.id === uid);
      const data = byUserMap.get(uid)!;
      return {
        userId: uid,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        totalCop: data.totalCop,
        count: data.count,
      };
    });

    res.json({ totalCop, byPaymentMethod, byUser });
  },
);

router.get(
  "/reports/inventory",
  requireRole("admin", "warehouse_admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { eventId, locationId } = req.query as { eventId?: string; locationId?: string };
    const user = req.user!;

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
        quantityOnHand: item.quantityOnHand,
        restockTrigger: item.restockTrigger,
        isLowStock: item.quantityOnHand <= item.restockTrigger,
      };
    });

    res.json({ items: report });
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

    await db
      .update(braceletsTable)
      .set({ flagged: true, flagReason: reason ?? "HMAC verification failed", updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, nfcUid));

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

export default router;

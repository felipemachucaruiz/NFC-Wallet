import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  merchantsTable,
  transactionLogsTable,
  transactionLineItemsTable,
  merchantPayoutsTable,
  locationsTable,
  productsTable,
  locationInventoryTable,
  userLocationAssignmentsTable,
  restockOrdersTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const createMerchantSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  commissionRatePercent: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
  merchantType: z.enum(["event_managed", "external"]).default("event_managed"),
});

const updateMerchantSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  commissionRatePercent: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  merchantType: z.enum(["event_managed", "external"]).optional(),
  active: z.boolean().optional(),
});

router.get("/merchants", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.query as { eventId?: string };
  const user = req.user!;

  if (user.role === "merchant_admin") {
    if (!user.merchantId) {
      res.json({ merchants: [] });
      return;
    }
    const merchants = await db
      .select()
      .from(merchantsTable)
      .where(
        and(
          eq(merchantsTable.id, user.merchantId),
          eventId ? eq(merchantsTable.eventId, eventId) : undefined,
        ),
      );
    res.json({ merchants });
    return;
  }

  if (user.role === "event_admin") {
    if (!user.eventId) {
      res.json({ merchants: [] });
      return;
    }
    const merchants = await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.eventId, user.eventId));
    res.json({ merchants });
    return;
  }

  const merchants = await db
    .select()
    .from(merchantsTable)
    .where(eventId ? eq(merchantsTable.eventId, eventId) : undefined);
  res.json({ merchants });
});

router.post("/merchants", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  const parsed = createMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.user!;
  if (user.role === "event_admin") {
    if (!user.eventId || parsed.data.eventId !== user.eventId) {
      res.status(403).json({ error: "You can only create merchants for your event" });
      return;
    }
  }

  const [merchant] = await db
    .insert(merchantsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(merchant);
});

router.get("/merchants/:merchantId", requireAuth, async (req: Request, res: Response) => {
  const merchantId = req.params.merchantId as string;
  const user = req.user!;

  if (user.role === "merchant_admin" && user.merchantId !== merchantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  if (user.role === "event_admin" && merchant.eventId !== user.eventId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(merchant);
});

router.patch(
  "/merchants/:merchantId",
  requireRole("admin", "merchant_admin", "event_admin"),
  async (req: Request, res: Response) => {
    const merchantId = req.params.merchantId as string;
    const user = req.user!;

    if (user.role === "merchant_admin" && user.merchantId !== merchantId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (user.role === "event_admin") {
      const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      if (!merchant || merchant.eventId !== user.eventId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const parsed = updateMerchantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [merchant] = await db
      .update(merchantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(merchantsTable.id, merchantId))
      .returning();
    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }
    res.json(merchant);
  },
);

router.get(
  "/merchants/:merchantId/earnings",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const merchantId = req.params.merchantId as string;

    if (req.user!.role === "merchant_admin" && req.user!.merchantId !== merchantId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { eventId, from, to } = req.query as { eventId?: string; from?: string; to?: string };

    const conditions: ReturnType<typeof eq>[] = [eq(transactionLogsTable.merchantId, merchantId)];
    if (eventId) conditions.push(eq(transactionLogsTable.eventId, eventId));
    if (from) conditions.push(gte(transactionLogsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactionLogsTable.createdAt, new Date(to)));

    const txRows = await db
      .select()
      .from(transactionLogsTable)
      .where(and(...conditions));

    const grossSalesCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);
    const totalCommissionCop = txRows.reduce((s, r) => s + r.commissionAmountCop, 0);
    const netEarnedCop = txRows.reduce((s, r) => s + r.netAmountCop, 0);

    const txIds = txRows.map((r) => r.id);
    let cogsCop = 0;
    if (txIds.length > 0) {
      const lineItemRows = await db
        .select()
        .from(transactionLineItemsTable)
        .where(sql`${transactionLineItemsTable.transactionLogId} = ANY(ARRAY[${sql.join(txIds.map((id) => sql`${id}`), sql`, `)}]::text[])`);
      cogsCop = lineItemRows.reduce((s, li) => s + li.unitCostSnapshot * li.quantity, 0);
    }

    const grossProfitCop = grossSalesCop - cogsCop;
    const profitMarginPercent = grossSalesCop > 0
      ? Math.round((grossProfitCop / grossSalesCop) * 10000) / 100
      : 0;

    const payoutConditions: ReturnType<typeof eq>[] = [eq(merchantPayoutsTable.merchantId, merchantId)];
    if (eventId) payoutConditions.push(eq(merchantPayoutsTable.eventId, eventId));
    if (from) payoutConditions.push(gte(merchantPayoutsTable.paidAt, new Date(from)));
    if (to) payoutConditions.push(lte(merchantPayoutsTable.paidAt, new Date(to)));
    const payouts = await db
      .select()
      .from(merchantPayoutsTable)
      .where(and(...payoutConditions));

    const totalPaidOutCop = payouts.reduce((s, p) => s + p.netPayoutCop, 0);
    const pendingCop = netEarnedCop - totalPaidOutCop;

    res.json({
      merchantId,
      grossSalesCop,
      cogsCop,
      grossProfitCop,
      profitMarginPercent,
      marginPercent: profitMarginPercent,
      totalCommissionCop,
      netEarnedCop,
      totalPaidOutCop,
      pendingCop,
      payouts,
    });
  },
);

router.delete(
  "/merchants/:merchantId",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { merchantId } = req.params as { merchantId: string };

    const merchant = await db.query.merchantsTable.findFirst({
      where: eq(merchantsTable.id, merchantId),
    });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    // Block deletion if any transaction history exists
    const txCount = await db.$count(transactionLogsTable, eq(transactionLogsTable.merchantId, merchantId));
    if (txCount > 0) {
      return res.status(409).json({
        error: "Cannot delete a merchant with transaction history. Deactivate it instead.",
      });
    }

    // Cascade delete in dependency order
    const locationRows = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.merchantId, merchantId));
    const locationIds = locationRows.map((r) => r.id);

    const productRows = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.merchantId, merchantId));
    const productIds = productRows.map((r) => r.id);

    if (locationIds.length > 0) {
      await db.delete(locationInventoryTable).where(inArray(locationInventoryTable.locationId, locationIds));
      await db.delete(userLocationAssignmentsTable).where(inArray(userLocationAssignmentsTable.locationId, locationIds));
      await db.delete(stockMovementsTable).where(inArray(stockMovementsTable.fromLocationId, locationIds));
      await db.delete(stockMovementsTable).where(inArray(stockMovementsTable.toLocationId, locationIds));
      await db.delete(restockOrdersTable).where(inArray(restockOrdersTable.locationId, locationIds));
      await db.delete(locationsTable).where(inArray(locationsTable.id, locationIds));
    }

    if (productIds.length > 0) {
      await db.delete(productsTable).where(inArray(productsTable.id, productIds));
    }

    await db.delete(merchantsTable).where(eq(merchantsTable.id, merchantId));

    res.json({ success: true });
  },
);

export default router;

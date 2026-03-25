import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantsTable, transactionLogsTable, merchantPayoutsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const createMerchantSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  commissionRatePercent: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
});

const updateMerchantSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  commissionRatePercent: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  active: z.boolean().optional(),
});

router.get("/merchants", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.query as { eventId?: string };
  const merchants = await db
    .select()
    .from(merchantsTable)
    .where(eventId ? eq(merchantsTable.eventId, eventId) : undefined);
  res.json({ merchants });
});

router.post("/merchants", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = createMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [merchant] = await db
    .insert(merchantsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(merchant);
});

router.get("/merchants/:merchantId", requireAuth, async (req: Request, res: Response) => {
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.params.merchantId as string));
  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }
  res.json(merchant);
});

router.patch(
  "/merchants/:merchantId",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateMerchantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [merchant] = await db
      .update(merchantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(merchantsTable.id, req.params.merchantId as string))
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
    const { merchantId } = req.params as { merchantId: string };
    const { eventId, from, to } = req.query as { eventId?: string; from?: string; to?: string };

    const conditions = [eq(transactionLogsTable.merchantId, merchantId)];
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

    // COGS from line items not aggregated here — full profit tracking per product
    // For now, track what we have in transaction logs
    const cogsCop = 0; // Populated in detailed report; line items hold unit_cost_snapshot

    const grossProfitCop = grossSalesCop - cogsCop;
    const profitMarginPercent = grossSalesCop > 0
      ? Math.round((grossProfitCop / grossSalesCop) * 10000) / 100
      : 0;

    const payoutConditions = [eq(merchantPayoutsTable.merchantId, merchantId)];
    if (eventId) payoutConditions.push(eq(merchantPayoutsTable.eventId, eventId));
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
      totalCommissionCop,
      netEarnedCop,
      totalPaidOutCop,
      pendingCop,
      payouts,
    });
  },
);

export default router;

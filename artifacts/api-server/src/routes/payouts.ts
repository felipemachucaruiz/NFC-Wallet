import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantPayoutsTable, transactionLogsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const payoutPaymentMethods = ["transfer", "nequi", "cash", "other"] as const;

const createPayoutSchema = z.object({
  merchantId: z.string().min(1),
  eventId: z.string().min(1),
  periodFrom: z.string(),
  periodTo: z.string(),
  paymentMethod: z.enum(payoutPaymentMethods),
  referenceNote: z.string().optional(),
  paidAt: z.string(),
});

router.get(
  "/payouts",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { merchantId, eventId } = req.query as { merchantId?: string; eventId?: string };
    const conditions = [];

    if (req.user.role === "merchant_admin") {
      // merchant_admin can only see their own merchant's payouts
      // For now, filter by merchantId param if provided, otherwise return empty
      if (!merchantId) {
        res.json({ payouts: [] });
        return;
      }
      conditions.push(eq(merchantPayoutsTable.merchantId, merchantId));
    } else {
      if (merchantId) conditions.push(eq(merchantPayoutsTable.merchantId, merchantId));
    }

    if (eventId) conditions.push(eq(merchantPayoutsTable.eventId, eventId));

    const payouts = await db
      .select()
      .from(merchantPayoutsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({ payouts });
  },
);

router.post(
  "/payouts",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createPayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { merchantId, eventId, periodFrom, periodTo, paymentMethod, referenceNote, paidAt } = parsed.data;

    const periodFromDate = new Date(periodFrom);
    const periodToDate = new Date(periodTo);

    // Calculate actuals from transaction logs for the period
    const txRows = await db
      .select()
      .from(transactionLogsTable)
      .where(
        and(
          eq(transactionLogsTable.merchantId, merchantId),
          eq(transactionLogsTable.eventId, eventId),
          gte(transactionLogsTable.createdAt, periodFromDate),
          lte(transactionLogsTable.createdAt, periodToDate),
        ),
      );

    const grossSalesCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);
    const commissionCop = txRows.reduce((s, r) => s + r.commissionAmountCop, 0);
    const netPayoutCop = txRows.reduce((s, r) => s + r.netAmountCop, 0);

    const [payout] = await db
      .insert(merchantPayoutsTable)
      .values({
        merchantId,
        eventId,
        periodFrom: periodFromDate,
        periodTo: periodToDate,
        grossSalesCop,
        commissionCop,
        netPayoutCop,
        paymentMethod,
        referenceNote,
        performedByUserId: req.user.id,
        paidAt: new Date(paidAt),
      })
      .returning();

    res.status(201).json(payout);
  },
);

export default router;

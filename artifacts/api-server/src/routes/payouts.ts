import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantPayoutsTable, transactionLogsTable } from "@workspace/db";
import { eq, and, gte, lte, asc } from "drizzle-orm";
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
    const { eventId } = req.query as { eventId?: string };
    const conditions = [];

    if (req.user!.role === "merchant_admin") {
      if (!req.user!.merchantId) {
        res.json({ payouts: [] });
        return;
      }
      conditions.push(eq(merchantPayoutsTable.merchantId, req.user!.merchantId));
    } else {
      const { merchantId } = req.query as { merchantId?: string };
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
    const parsed = createPayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { merchantId, eventId, periodFrom, periodTo, paymentMethod, referenceNote, paidAt } = parsed.data;

    const periodFromDate = new Date(periodFrom);
    const periodToDate = new Date(periodTo);

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
        performedByUserId: req.user!.id,
        paidAt: new Date(paidAt),
      })
      .returning();

    res.status(201).json(payout);
  },
);

router.get(
  "/payouts/:payoutId/transactions",
  requireRole("admin", "merchant_admin"),
  async (req: Request, res: Response) => {
    const { payoutId } = req.params as { payoutId: string };

    const [payout] = await db
      .select()
      .from(merchantPayoutsTable)
      .where(eq(merchantPayoutsTable.id, payoutId));

    if (!payout) {
      res.status(404).json({ error: "Payout not found" });
      return;
    }

    if (req.user!.role === "merchant_admin" && req.user!.merchantId !== payout.merchantId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const transactions = await db
      .select()
      .from(transactionLogsTable)
      .where(
        and(
          eq(transactionLogsTable.merchantId, payout.merchantId),
          eq(transactionLogsTable.eventId, payout.eventId),
          gte(transactionLogsTable.createdAt, payout.periodFrom),
          lte(transactionLogsTable.createdAt, payout.periodTo),
        ),
      )
      .orderBy(asc(transactionLogsTable.createdAt));

    res.json({ payout, transactions });
  },
);

router.patch(
  "/payouts/:payoutId",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      referenceNote: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [payout] = await db
      .update(merchantPayoutsTable)
      .set(parsed.data)
      .where(eq(merchantPayoutsTable.id, req.params.payoutId as string))
      .returning();
    if (!payout) {
      res.status(404).json({ error: "Payout not found" });
      return;
    }
    res.json(payout);
  },
);

export default router;

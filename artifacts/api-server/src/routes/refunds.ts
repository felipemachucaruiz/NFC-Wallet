import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, refundsTable } from "@workspace/db";
import { eq, and, gt, gte, lte, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const refundMethods = ["cash", "nequi", "bancolombia", "other"] as const;

const createRefundSchema = z.object({
  braceletUid: z.string().min(1),
  refundMethod: z.enum(refundMethods),
  notes: z.string().optional(),
});

router.post(
  "/refunds",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { braceletUid, refundMethod, notes } = parsed.data;

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletUid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (bracelet.lastKnownBalanceCop <= 0) {
      res.status(400).json({ error: "Bracelet has no balance to refund" });
      return;
    }

    const amountCop = bracelet.lastKnownBalanceCop;
    const eventId = bracelet.eventId;

    if (!eventId) {
      res.status(400).json({ error: "Bracelet is not associated with an event" });
      return;
    }

    const [refund] = await db
      .insert(refundsTable)
      .values({
        braceletUid,
        eventId,
        amountCop,
        refundMethod,
        notes,
        performedByUserId: req.user.id,
      })
      .returning();

    await db
      .update(braceletsTable)
      .set({ lastKnownBalanceCop: 0, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, braceletUid));

    res.status(201).json({ refund, amountCop });
  },
);

router.get(
  "/events/:eventId/unclaimed-balances",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = req.params;

    if (req.user.role === "event_admin" && req.user.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: cannot access another event's data" });
      return;
    }

    const bracelets = await db
      .select()
      .from(braceletsTable)
      .where(
        and(
          eq(braceletsTable.eventId, eventId),
          gt(braceletsTable.lastKnownBalanceCop, 0),
        ),
      );

    const refunds = await db
      .select()
      .from(refundsTable)
      .where(eq(refundsTable.eventId, eventId))
      .orderBy(desc(refundsTable.createdAt));

    const latestRefundByUid: Record<string, typeof refunds[0]> = {};
    for (const r of refunds) {
      if (!latestRefundByUid[r.braceletUid]) {
        latestRefundByUid[r.braceletUid] = r;
      }
    }

    const result = bracelets.map((b) => ({
      ...b,
      latestRefund: latestRefundByUid[b.nfcUid] ?? null,
    }));

    const totalUnclaimedCop = result.reduce((s, b) => s + b.lastKnownBalanceCop, 0);

    res.json({ bracelets: result, totalUnclaimedCop });
  },
);

router.get(
  "/reports/refunds",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as { eventId?: string; from?: string; to?: string };
    const user = req.user!;

    const conditions = [];

    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ totalRefundedCop: 0, count: 0, byRefundMethod: {} });
        return;
      }
      conditions.push(eq(refundsTable.eventId, user.eventId));
    } else {
      if (eventId) conditions.push(eq(refundsTable.eventId, eventId));
    }

    if (from) conditions.push(gte(refundsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(refundsTable.createdAt, new Date(to)));

    const refunds = await db
      .select()
      .from(refundsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalRefundedCop = refunds.reduce((s, r) => s + r.amountCop, 0);
    const count = refunds.length;
    const byRefundMethod: Record<string, { totalCop: number; count: number }> = {};

    for (const r of refunds) {
      if (!byRefundMethod[r.refundMethod]) {
        byRefundMethod[r.refundMethod] = { totalCop: 0, count: 0 };
      }
      byRefundMethod[r.refundMethod].totalCop += r.amountCop;
      byRefundMethod[r.refundMethod].count += 1;
    }

    res.json({ totalRefundedCop, count, byRefundMethod });
  },
);

export default router;

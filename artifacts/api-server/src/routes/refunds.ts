import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, refundsTable } from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
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

    res.json({ bracelets: result });
  },
);

export default router;

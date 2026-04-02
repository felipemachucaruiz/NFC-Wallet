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
  newCounter: z.number().int().optional(),
  newBalanceCop: z.number().int().optional(),
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

    const { braceletUid, refundMethod, notes, newCounter } = parsed.data;

    try {
      // All validation and writes happen inside the transaction so that
      // SELECT ... FOR UPDATE prevents two concurrent refunds from both
      // seeing a positive balance and both going through.
      const { refund, amountCop } = await db.transaction(async (tx) => {
        const [bracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, braceletUid))
          .for("update");

        if (!bracelet)
          throw Object.assign(new Error("Bracelet not found"), { httpStatus: 404 });
        if (bracelet.lastKnownBalanceCop <= 0)
          throw Object.assign(new Error("Bracelet has no balance to refund"), { httpStatus: 400 });
        if (newCounter !== undefined && newCounter <= (bracelet.lastCounter ?? 0))
          throw Object.assign(new Error("Invalid counter: must be greater than current counter"), { httpStatus: 400 });
        if (!bracelet.eventId)
          throw Object.assign(new Error("Bracelet is not associated with an event"), { httpStatus: 400 });

        const liveAmountCop = bracelet.lastKnownBalanceCop;

        const [newRefund] = await tx
          .insert(refundsTable)
          .values({
            braceletUid,
            eventId: bracelet.eventId,
            amountCop: liveAmountCop,
            refundMethod,
            notes,
            performedByUserId: req.user.id,
          })
          .returning();

        const braceletUpdate: Record<string, unknown> = {
          lastKnownBalanceCop: 0,
          updatedAt: new Date(),
        };
        if (newCounter !== undefined) {
          braceletUpdate.lastCounter = newCounter;
        }
        await tx
          .update(braceletsTable)
          .set(braceletUpdate)
          .where(eq(braceletsTable.nfcUid, braceletUid));

        return { refund: newRefund, amountCop: liveAmountCop };
      });

      res.status(201).json({ refund, amountCop });
    } catch (e: unknown) {
      const err = e as { message?: string; httpStatus?: number };
      const status = err.httpStatus ?? 500;
      res.status(status).json({ error: err.message ?? "Refund failed" });
    }
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

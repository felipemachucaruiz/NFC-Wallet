import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, braceletsTable, topUpsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const paymentMethods = ["cash", "card_external", "nequi_transfer", "bancolombia_transfer", "other"] as const;

const createTopUpSchema = z.object({
  nfcUid: z.string().min(1),
  amountCop: z.number().int().min(1),
  paymentMethod: z.enum(paymentMethods),
  wompiTransactionId: z.string().optional(),
});

function computeHmac(balance: number, counter: number): string {
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) throw new Error("HMAC_SECRET not configured");
  const payload = `${balance}:${counter}`;
  return crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
}

router.post(
  "/topups",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createTopUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { nfcUid, amountCop, paymentMethod, wompiTransactionId } = parsed.data;

    let [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    // Auto-register new bracelets on first top-up
    if (!bracelet) {
      const [created] = await db
        .insert(braceletsTable)
        .values({ nfcUid, lastKnownBalanceCop: 0, lastCounter: 0 })
        .returning();
      bracelet = created;
    }

    const newBalance = bracelet.lastKnownBalanceCop + amountCop;
    const newCounter = bracelet.lastCounter + 1;
    const hmac = computeHmac(newBalance, newCounter);

    const [topUp] = await db
      .insert(topUpsTable)
      .values({
        braceletUid: nfcUid,
        amountCop,
        paymentMethod,
        performedByUserId: req.user.id,
        wompiTransactionId,
        status: "completed",
        newBalanceCop: newBalance,
        newCounter,
      })
      .returning();

    await db
      .update(braceletsTable)
      .set({
        lastKnownBalanceCop: newBalance,
        lastCounter: newCounter,
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, nfcUid));

    res.status(201).json({
      topUp,
      signedPayload: { balance: newBalance, counter: newCounter, hmac },
    });
  },
);

const syncTopUpSchema = z.object({
  id: z.string().min(1),
  nfcUid: z.string().min(1),
  amountCop: z.number().int().min(1),
  paymentMethod: z.enum(paymentMethods),
  newBalance: z.number().int().min(0),
  newCounter: z.number().int().min(1),
  offlineCreatedAt: z.string().optional(),
});

router.post(
  "/topups/sync",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = syncTopUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, nfcUid, amountCop, paymentMethod, newBalance, newCounter, offlineCreatedAt } = parsed.data;

    // Idempotency: check if already processed (use id as idempotency key)
    const existing = await db
      .select()
      .from(topUpsTable)
      .where(eq(topUpsTable.idempotencyKey, id));
    if (existing.length > 0) {
      res.status(409).json({ error: "Duplicate top-up (already synced)" });
      return;
    }

    let [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    // Auto-register new bracelets
    if (!bracelet) {
      const [created] = await db
        .insert(braceletsTable)
        .values({ nfcUid, lastKnownBalanceCop: 0, lastCounter: 0 })
        .returning();
      bracelet = created;
    }

    // Counter must be strictly increasing
    if (bracelet.lastCounter !== null && newCounter <= bracelet.lastCounter) {
      res.status(400).json({ error: `Counter replay detected: submitted ${newCounter} ≤ stored ${bracelet.lastCounter}` });
      return;
    }

    // Balance consistency: newBalance must equal stored balance + amountCop
    const expectedBalance = bracelet.lastKnownBalanceCop + amountCop;
    if (newBalance !== expectedBalance) {
      res.status(400).json({
        error: `Balance mismatch: expected ${expectedBalance} (${bracelet.lastKnownBalanceCop} + ${amountCop}), got ${newBalance}`,
      });
      return;
    }

    const [topUp] = await db
      .insert(topUpsTable)
      .values({
        idempotencyKey: id,
        braceletUid: nfcUid,
        amountCop,
        paymentMethod,
        performedByUserId: req.user.id,
        status: "completed",
        newBalanceCop: newBalance,
        newCounter,
        syncedAt: new Date(),
        offlineCreatedAt: offlineCreatedAt ? new Date(offlineCreatedAt) : null,
      })
      .returning();

    await db
      .update(braceletsTable)
      .set({
        lastKnownBalanceCop: newBalance,
        lastCounter: newCounter,
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, nfcUid));

    res.status(201).json({ topUp, status: "created" });
  },
);

router.get(
  "/topups/my-shift",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const topUps = await db
      .select()
      .from(topUpsTable)
      .where(
        and(
          eq(topUpsTable.performedByUserId, req.user.id),
          gte(topUpsTable.createdAt, todayStart),
          lte(topUpsTable.createdAt, todayEnd),
        ),
      );

    const totalCop = topUps.reduce((sum, t) => sum + t.amountCop, 0);
    const byPaymentMethod: Record<string, number> = {};
    for (const t of topUps) {
      byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] ?? 0) + t.amountCop;
    }

    res.json({ topUps, totalCop, byPaymentMethod });
  },
);

export default router;

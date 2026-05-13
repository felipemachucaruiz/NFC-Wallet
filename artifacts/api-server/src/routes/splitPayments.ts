import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  splitPaymentSessionsTable,
  splitPaymentSessionItemsTable,
  transactionLogsTable,
  productsTable,
  locationsTable,
  merchantsTable,
  eventsTable,
  braceletsTable,
  locationInventoryTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../middlewares/requireRole";
import { requireAttestation } from "../middlewares/requireAttestation";
import { deriveEventKey, verifyBraceletHmac } from "../lib/kdf";

const router: IRouter = Router();

const openSessionSchema = z.object({
  locationId: z.string().min(1),
  tipAmount: z.number().int().min(0).default(0),
  lineItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
});

const chargeSessionSchema = z.object({
  idempotencyKey: z.string().min(1),
  nfcUid: z.string().min(1),
  amount: z.number().int().min(1),
  newBalance: z.number().int().min(0),
  counter: z.number().int().min(0),
  hmac: z.string().optional(),
});

async function loadSessionWithDetails(sessionId: string) {
  const [session] = await db
    .select()
    .from(splitPaymentSessionsTable)
    .where(eq(splitPaymentSessionsTable.id, sessionId));
  if (!session) return null;

  const items = await db
    .select()
    .from(splitPaymentSessionItemsTable)
    .where(eq(splitPaymentSessionItemsTable.sessionId, sessionId));

  const payments = await db
    .select({
      id: transactionLogsTable.id,
      braceletUid: transactionLogsTable.braceletUid,
      grossAmount: transactionLogsTable.grossAmount,
      commissionAmount: transactionLogsTable.commissionAmount,
      netAmount: transactionLogsTable.netAmount,
      newBalance: transactionLogsTable.newBalance,
      createdAt: transactionLogsTable.createdAt,
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.splitSessionId, sessionId));

  return { ...session, items, payments };
}

router.get(
  "/split-sessions",
  requireRole("merchant_staff", "merchant_admin", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, merchantId, locationId, status } = req.query as Record<string, string | undefined>;
    const conditions = [];
    if (eventId) conditions.push(eq(splitPaymentSessionsTable.eventId, eventId));
    if (merchantId) conditions.push(eq(splitPaymentSessionsTable.merchantId, merchantId));
    if (locationId) conditions.push(eq(splitPaymentSessionsTable.locationId, locationId));
    if (status && ["open", "completed", "cancelled"].includes(status)) {
      conditions.push(eq(splitPaymentSessionsTable.status, status as "open" | "completed" | "cancelled"));
    }

    // For merchant roles, scope to their merchant
    if (req.user!.role === "merchant_staff" || req.user!.role === "merchant_admin") {
      if (!req.user!.merchantId) {
        res.json({ sessions: [] });
        return;
      }
      conditions.push(eq(splitPaymentSessionsTable.merchantId, req.user!.merchantId));
    }

    const sessions = await db
      .select()
      .from(splitPaymentSessionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${splitPaymentSessionsTable.createdAt} DESC`)
      .limit(200);

    if (sessions.length === 0) {
      res.json({ sessions: [] });
      return;
    }

    const sessionIds = sessions.map((s) => s.id);
    const allItems = await db
      .select()
      .from(splitPaymentSessionItemsTable)
      .where(inArray(splitPaymentSessionItemsTable.sessionId, sessionIds));
    const allPayments = await db
      .select({
        id: transactionLogsTable.id,
        splitSessionId: transactionLogsTable.splitSessionId,
        braceletUid: transactionLogsTable.braceletUid,
        grossAmount: transactionLogsTable.grossAmount,
        commissionAmount: transactionLogsTable.commissionAmount,
        netAmount: transactionLogsTable.netAmount,
        newBalance: transactionLogsTable.newBalance,
        createdAt: transactionLogsTable.createdAt,
      })
      .from(transactionLogsTable)
      .where(inArray(transactionLogsTable.splitSessionId, sessionIds));

    const enriched = sessions.map((s) => ({
      ...s,
      items: allItems.filter((it) => it.sessionId === s.id),
      payments: allPayments.filter((p) => p.splitSessionId === s.id),
    }));

    res.json({ sessions: enriched });
  },
);

router.get(
  "/split-sessions/:sessionId",
  requireRole("merchant_staff", "merchant_admin", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await loadSessionWithDetails(sessionId);
    if (!session) {
      res.status(404).json({ error: "Split session not found" });
      return;
    }
    res.json(session);
  },
);

router.post(
  "/split-sessions",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = openSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { locationId, tipAmount, lineItems } = parsed.data;

    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
    if (!location) {
      res.status(400).json({ error: "Location not found" });
      return;
    }
    if (
      (req.user.role === "merchant_admin" || req.user.role === "merchant_staff") &&
      (!req.user.merchantId || location.merchantId !== req.user.merchantId)
    ) {
      res.status(403).json({ error: "Access denied: location does not belong to your merchant" });
      return;
    }

    const productIds = lineItems.map((li) => li.productId);
    const products = await db
      .select()
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    const itemInserts: Array<{
      sessionId: string;
      productId: string;
      productNameSnapshot: string;
      unitPriceSnapshot: number;
      unitCostSnapshot: number;
      quantity: number;
    }> = [];

    for (const li of lineItems) {
      const product = productMap.get(li.productId);
      if (!product) {
        res.status(400).json({ error: `Product ${li.productId} not found` });
        return;
      }
      totalAmount += product.price * li.quantity;
      itemInserts.push({
        sessionId: "", // filled after insert
        productId: product.id,
        productNameSnapshot: product.name,
        unitPriceSnapshot: product.price,
        unitCostSnapshot: product.cost,
        quantity: li.quantity,
      });
    }

    const finalTotal = totalAmount + tipAmount;

    const session = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(splitPaymentSessionsTable)
        .values({
          eventId: location.eventId,
          merchantId: location.merchantId,
          locationId,
          totalAmount: finalTotal,
          tipAmount,
          openedByUserId: req.user.id,
        })
        .returning();
      const filled = itemInserts.map((it) => ({ ...it, sessionId: created.id }));
      await tx.insert(splitPaymentSessionItemsTable).values(filled);
      return created;
    });

    const full = await loadSessionWithDetails(session.id);
    res.status(201).json(full);
  },
);

router.post(
  "/split-sessions/:sessionId/charge",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  requireAttestation,
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = chargeSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    const { sessionId } = req.params as { sessionId: string };

    // Idempotency
    const existing = await db
      .select()
      .from(transactionLogsTable)
      .where(eq(transactionLogsTable.idempotencyKey, input.idempotencyKey));
    if (existing.length > 0) {
      const full = await loadSessionWithDetails(sessionId);
      res.status(200).json({ session: full, transaction: existing[0] });
      return;
    }

    const [session] = await db
      .select()
      .from(splitPaymentSessionsTable)
      .where(eq(splitPaymentSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Split session not found" });
      return;
    }
    if (session.status !== "open") {
      res.status(409).json({ error: `Session is ${session.status}` });
      return;
    }

    const remaining = session.totalAmount - session.paidAmount;
    if (input.amount > remaining) {
      res.status(400).json({ error: `Amount ${input.amount} exceeds remaining ${remaining}` });
      return;
    }

    // Authorize: merchant scope
    const [merchant] = await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.id, session.merchantId));
    if (!merchant) {
      res.status(400).json({ error: "Merchant not found" });
      return;
    }
    if (
      (req.user.role === "merchant_admin" || req.user.role === "merchant_staff") &&
      (!req.user.merchantId || merchant.id !== req.user.merchantId)
    ) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Bracelet checks (mirror /transactions/log)
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, input.nfcUid));
    if (!bracelet) {
      res.status(400).json({ error: "BRACELET_NOT_ACTIVATED: Esta pulsera no tiene saldo." });
      return;
    }
    if (bracelet.flagged) {
      res.status(400).json({ error: "Bracelet is flagged" });
      return;
    }
    if (merchant.eventId && bracelet.eventId && bracelet.eventId !== merchant.eventId) {
      res.status(400).json({ error: "BRACELET_WRONG_EVENT" });
      return;
    }
    if (bracelet.lastCounter !== null && input.counter <= bracelet.lastCounter) {
      res.status(400).json({ error: `Counter replay detected` });
      return;
    }

    // HMAC verification (KDF-aware)
    {
      const eventId = bracelet.eventId ?? merchant.eventId ?? null;
      const candidateKeys: string[] = [];
      let useKdf = false;
      if (eventId) {
        const [event] = await db
          .select({ useKdf: eventsTable.useKdf, hmacSecret: eventsTable.hmacSecret })
          .from(eventsTable)
          .where(eq(eventsTable.id, eventId));
        if (event?.useKdf) {
          useKdf = true;
          const masterKey = process.env.HMAC_MASTER_KEY;
          if (!masterKey) {
            res.status(500).json({ error: "HMAC_MASTER_KEY not configured" });
            return;
          }
          candidateKeys.push(deriveEventKey(masterKey, eventId));
          if (event.hmacSecret) candidateKeys.push(event.hmacSecret);
        } else if (event?.hmacSecret) {
          candidateKeys.push(event.hmacSecret);
        }
      }
      const globalSecret = process.env.HMAC_SECRET;
      if (globalSecret && !candidateKeys.includes(globalSecret)) candidateKeys.push(globalSecret);

      if (candidateKeys.length > 0) {
        if (useKdf && !input.hmac) {
          res.status(400).json({ error: "HMAC_REQUIRED" });
          return;
        }
        if (input.hmac) {
          const { valid } = verifyBraceletHmac(
            input.newBalance,
            input.counter,
            input.hmac,
            candidateKeys,
            input.nfcUid,
          );
          if (!valid) {
            res.status(400).json({ error: "HMAC_UID_MISMATCH" });
            return;
          }
        }
      }
    }

    // Commission on this partial only
    let commissionRate = parseFloat(merchant.commissionRatePercent ?? "0");
    if (commissionRate === 0 && merchant.eventId) {
      const [ev] = await db
        .select({ platformCommissionRate: eventsTable.platformCommissionRate })
        .from(eventsTable)
        .where(eq(eventsTable.id, merchant.eventId));
      if (ev) commissionRate = parseFloat(ev.platformCommissionRate as unknown as string) || 0;
    }
    const commissionAmount = Math.round(input.amount * commissionRate / 100);
    const netAmount = input.amount - commissionAmount;

    // Atomic update: insert txLog, increment session paid_amount, update bracelet, complete session if reached
    const result = await db.transaction(async (tx) => {
      // Atomic paid_amount increment with bound check
      const updated = await tx
        .update(splitPaymentSessionsTable)
        .set({ paidAmount: sql`${splitPaymentSessionsTable.paidAmount} + ${input.amount}` })
        .where(
          and(
            eq(splitPaymentSessionsTable.id, sessionId),
            eq(splitPaymentSessionsTable.status, "open"),
            sql`${splitPaymentSessionsTable.paidAmount} + ${input.amount} <= ${splitPaymentSessionsTable.totalAmount}`,
          ),
        )
        .returning();
      if (updated.length === 0) {
        throw new Error("SESSION_RACE_OVERPAY");
      }
      const updatedSession = updated[0];

      const [txLog] = await tx
        .insert(transactionLogsTable)
        .values({
          idempotencyKey: input.idempotencyKey,
          braceletUid: input.nfcUid,
          locationId: updatedSession.locationId,
          merchantId: updatedSession.merchantId,
          eventId: updatedSession.eventId,
          grossAmount: input.amount,
          tipAmount: 0,
          commissionAmount,
          netAmount,
          newBalance: input.newBalance,
          counter: input.counter,
          performedByUserId: req.user.id,
          splitSessionId: sessionId,
        })
        .returning();

      await tx
        .update(braceletsTable)
        .set({
          lastKnownBalance: input.newBalance,
          lastCounter: input.counter,
          updatedAt: new Date(),
        })
        .where(eq(braceletsTable.nfcUid, input.nfcUid));

      // Auto-complete on full payment + decrement inventory from session items
      let finalSession = updatedSession;
      if (updatedSession.paidAmount >= updatedSession.totalAmount) {
        const items = await tx
          .select()
          .from(splitPaymentSessionItemsTable)
          .where(eq(splitPaymentSessionItemsTable.sessionId, sessionId));

        for (const item of items) {
          if (!item.productId) continue;
          const [locInv] = await tx
            .select()
            .from(locationInventoryTable)
            .where(
              and(
                eq(locationInventoryTable.locationId, updatedSession.locationId),
                eq(locationInventoryTable.productId, item.productId),
              ),
            );
          if (locInv) {
            // Decrement without minimum check — inventory may go negative; admin reconciles.
            await tx
              .update(locationInventoryTable)
              .set({
                quantityOnHand: sql`${locationInventoryTable.quantityOnHand} - ${item.quantity}`,
                updatedAt: new Date(),
              })
              .where(eq(locationInventoryTable.id, locInv.id));
          }
        }

        const [completed] = await tx
          .update(splitPaymentSessionsTable)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(splitPaymentSessionsTable.id, sessionId))
          .returning();
        finalSession = completed;
      }

      return { session: finalSession, transaction: txLog };
    });

    const full = await loadSessionWithDetails(sessionId);
    res.status(201).json({ session: full, transaction: result.transaction });
  },
);

router.post(
  "/split-sessions/:sessionId/cancel",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    const [session] = await db
      .select()
      .from(splitPaymentSessionsTable)
      .where(eq(splitPaymentSessionsTable.id, (req.params as { sessionId: string }).sessionId));
    if (!session) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (session.status !== "open") {
      res.status(400).json({ error: `Session is ${session.status}` });
      return;
    }
    if (session.paidAmount > 0) {
      res.status(400).json({ error: "Cannot cancel session with partial payments — refund manually" });
      return;
    }
    await db
      .update(splitPaymentSessionsTable)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(splitPaymentSessionsTable.id, (req.params as { sessionId: string }).sessionId));
    const full = await loadSessionWithDetails((req.params as { sessionId: string }).sessionId);
    res.json(full);
  },
);

export default router;

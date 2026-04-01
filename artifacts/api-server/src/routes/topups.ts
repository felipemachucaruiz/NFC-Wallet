import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable, topUpsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireAttestation } from "../middlewares/requireAttestation";
import { z } from "zod";
import { deriveEventKey, computeBraceletHmac, verifyBraceletHmac } from "../lib/kdf";

const router: IRouter = Router();

const paymentMethods = ["cash", "card_external", "nequi_transfer", "bancolombia_transfer", "other"] as const;

const createTopUpSchema = z.object({
  nfcUid: z.string().min(1),
  amountCop: z.number().int().min(1),
  paymentMethod: z.enum(paymentMethods),
  wompiTransactionId: z.string().optional(),
});

interface HmacKeyResult {
  /** Primary signing key (used for computing new HMAC values to write to bracelets) */
  primaryKey: string;
  /** All candidate keys for verification, in priority order (primary first, then legacy fallbacks) */
  candidateKeys: string[];
  useKdf: boolean;
}

/**
 * Resolve HMAC keys for an event.
 * - Primary key: used when computing new HMAC values to write to bracelets
 * - Candidate keys: all keys tried during verification (primary + legacy fallbacks)
 *   so existing bracelets continue working during migration from legacy → KDF keys
 * - Event-null path always falls back to HMAC_SECRET (not HMAC_MASTER_KEY) to stay
 *   consistent with the key that those bracelets were originally signed with
 */
async function resolveHmacKey(eventId: string | null): Promise<HmacKeyResult> {
  const globalSecret = process.env.HMAC_SECRET ?? null;

  if (!eventId) {
    // No event: bracelets were signed with the global HMAC_SECRET
    if (!globalSecret) throw new Error("HMAC_SECRET not configured");
    return { primaryKey: globalSecret, candidateKeys: [globalSecret], useKdf: false };
  }

  const [event] = await db
    .select({ useKdf: eventsTable.useKdf, hmacSecret: eventsTable.hmacSecret })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));

  if (event?.useKdf) {
    const masterKey = process.env.HMAC_MASTER_KEY;
    if (!masterKey) throw new Error("HMAC_MASTER_KEY not configured");
    const derivedKey = deriveEventKey(masterKey, eventId);
    // Candidate keys: derived (primary) + pre-KDF per-event key + global secret
    // Allows existing bracelets signed before KDF was enabled to still verify
    const candidates: string[] = [derivedKey];
    if (event.hmacSecret) candidates.push(event.hmacSecret);
    if (globalSecret) candidates.push(globalSecret);
    return { primaryKey: derivedKey, candidateKeys: candidates, useKdf: true };
  }

  if (event?.hmacSecret) {
    const candidates: string[] = [event.hmacSecret];
    if (globalSecret) candidates.push(globalSecret);
    return { primaryKey: event.hmacSecret, candidateKeys: candidates, useKdf: false };
  }

  // Event exists but has no per-event key — use global fallback
  if (!globalSecret) throw new Error("HMAC_SECRET not configured and event has no per-event key");
  return { primaryKey: globalSecret, candidateKeys: [globalSecret], useKdf: false };
}

router.post(
  "/topups",
  requireRole("bank", "admin"),
  requireAttestation,
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
    const bankEventId = (req.user as { eventId?: string | null }).eventId ?? null;
    if (!bracelet) {
      const [created] = await db
        .insert(braceletsTable)
        .values({ nfcUid, lastKnownBalanceCop: 0, lastCounter: 0, eventId: bankEventId })
        .returning();
      bracelet = created;
    } else if (!bracelet.eventId && bankEventId) {
      // Backfill missing event_id on existing bracelets
      await db
        .update(braceletsTable)
        .set({ eventId: bankEventId })
        .where(eq(braceletsTable.nfcUid, nfcUid));
    }

    const effectiveEventId = bracelet.eventId ?? bankEventId;
    const newBalance = bracelet.lastKnownBalanceCop + amountCop;
    const newCounter = bracelet.lastCounter + 1;

    let hmac: string;
    try {
      const { primaryKey } = await resolveHmacKey(effectiveEventId);
      hmac = computeBraceletHmac(newBalance, newCounter, primaryKey, nfcUid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "HMAC configuration error";
      res.status(500).json({ error: msg });
      return;
    }

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
        pendingSync: false,
        pendingBalanceCop: 0,
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
  hmac: z.string().optional(),
});

router.post(
  "/topups/sync",
  requireRole("bank", "admin"),
  requireAttestation,
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
    const syncBankEventId = (req.user as { eventId?: string | null }).eventId ?? null;
    if (!bracelet) {
      const [created] = await db
        .insert(braceletsTable)
        .values({ nfcUid, lastKnownBalanceCop: 0, lastCounter: 0, eventId: syncBankEventId })
        .returning();
      bracelet = created;
    } else if (!bracelet.eventId && syncBankEventId) {
      await db
        .update(braceletsTable)
        .set({ eventId: syncBankEventId })
        .where(eq(braceletsTable.nfcUid, nfcUid));
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

    // Server-side HMAC verification for synced top-ups
    // The client wrote a new HMAC to the bracelet offline; we verify it matches what we'd have computed
    const effectiveSyncEventId = bracelet.eventId ?? syncBankEventId;
    try {
      const { candidateKeys, useKdf } = await resolveHmacKey(effectiveSyncEventId);
      const clientHmac = parsed.data.hmac;

      if (useKdf && !clientHmac) {
        res.status(400).json({ error: "HMAC_REQUIRED: Bracelet signature required for this event" });
        return;
      }

      if (clientHmac && candidateKeys.length > 0) {
        // Verify against all candidate keys: derived key first, then pre-KDF legacy keys,
        // so bracelets written before KDF was enabled continue to sync successfully
        const { valid } = verifyBraceletHmac(newBalance, newCounter, clientHmac, candidateKeys, nfcUid);
        if (!valid) {
          res.status(400).json({ error: "HMAC_UID_MISMATCH: Top-up signature invalid — possible clone or tamper detected" });
          return;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "HMAC configuration error";
      res.status(500).json({ error: msg });
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

    const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
    const nowUtcMs = Date.now();
    const nowColombiaMs = nowUtcMs + COLOMBIA_OFFSET_MS;
    const colombiaDate = new Date(nowColombiaMs);
    const yy = colombiaDate.getUTCFullYear();
    const mm = colombiaDate.getUTCMonth();
    const dd = colombiaDate.getUTCDate();
    const todayStart = new Date(Date.UTC(yy, mm, dd, 0, 0, 0, 0) - COLOMBIA_OFFSET_MS);
    const todayEnd = new Date(Date.UTC(yy, mm, dd, 23, 59, 59, 999) - COLOMBIA_OFFSET_MS);

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

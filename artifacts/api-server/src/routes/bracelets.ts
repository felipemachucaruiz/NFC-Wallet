import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable, transactionLogsTable, locationsTable, merchantsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRole, requireAuth } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const registerBraceletSchema = z.object({
  nfcUid: z.string().min(1),
  eventId: z.string().optional(),
  attendeeName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  maxOfflineSpend: z.number().int().positive().optional(),
});

const updateContactSchema = z.object({
  attendeeName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  maxOfflineSpend: z.number().int().positive().nullable().optional(),
});

router.post(
  "/bracelets",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const parsed = registerBraceletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { nfcUid, eventId, attendeeName, phone, email, maxOfflineSpend } = parsed.data;

    const existing = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (existing.length > 0) {
      res.status(409).json({ error: "Bracelet already registered" });
      return;
    }

    // Inherit maxOfflineSpend from event default if not explicitly set
    let resolvedMaxOfflineSpend: number | null = maxOfflineSpend ?? null;
    if (resolvedMaxOfflineSpend === null && eventId) {
      const [event] = await db
        .select({ maxOfflineSpendPerBracelet: eventsTable.maxOfflineSpendPerBracelet })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId));
      resolvedMaxOfflineSpend = event?.maxOfflineSpendPerBracelet ?? null;
    }

    const [bracelet] = await db
      .insert(braceletsTable)
      .values({ nfcUid, eventId, attendeeName, phone, email, maxOfflineSpend: resolvedMaxOfflineSpend })
      .returning();
    res.status(201).json(bracelet);
  },
);

/**
 * @summary Get bracelet by NFC UID — any authenticated user can check a bracelet
 */
router.get(
  "/bracelets/:nfcUid",
  requireAuth,
  async (req: Request, res: Response) => {
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, req.params.nfcUid as string));
    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }
    res.json(bracelet);
  },
);

/**
 * @summary Get recent transactions for a bracelet — any authenticated user
 */
router.get(
  "/bracelets/:nfcUid/transactions",
  requireAuth,
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const limitStr = req.query.limit as string | undefined;
    const limit = Math.min(Math.max(parseInt(limitStr ?? "5", 10) || 5, 1), 20);

    const transactions = await db
      .select({
        id: transactionLogsTable.id,
        grossAmountCop: transactionLogsTable.grossAmountCop,
        newBalanceCop: transactionLogsTable.newBalanceCop,
        createdAt: transactionLogsTable.createdAt,
        offlineCreatedAt: transactionLogsTable.offlineCreatedAt,
        merchantName: merchantsTable.name,
        locationName: locationsTable.name,
      })
      .from(transactionLogsTable)
      .leftJoin(merchantsTable, eq(transactionLogsTable.merchantId, merchantsTable.id))
      .leftJoin(locationsTable, eq(transactionLogsTable.locationId, locationsTable.id))
      .where(eq(transactionLogsTable.braceletUid, nfcUid))
      .orderBy(desc(transactionLogsTable.createdAt))
      .limit(limit);

    res.json({ transactions });
  },
);

/**
 * @summary Unflag a bracelet (remove ban)
 */
router.patch(
  "/admin/bracelets/:nfcUid/unflag",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }
    const [updated] = await db
      .update(braceletsTable)
      .set({ flagged: false, flagReason: null, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, nfcUid))
      .returning();
    res.json(updated);
  },
);

/**
 * @summary Reset a bracelet's balance to zero (admin only).
 * The NFC tag must also be physically written by the caller; this endpoint
 * syncs the server-side lastKnownBalanceCop to 0.
 */
router.post(
  "/admin/bracelets/:nfcUid/reset-balance",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }
    const [updated] = await db
      .update(braceletsTable)
      .set({ lastKnownBalanceCop: 0, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, nfcUid))
      .returning();
    res.json(updated);
  },
);

/**
 * @summary Delete a bracelet record (hard delete — transactions preserved)
 */
router.delete(
  "/admin/bracelets/:nfcUid",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }
    await db.delete(braceletsTable).where(eq(braceletsTable.nfcUid, nfcUid));
    res.json({ success: true });
  },
);

router.patch(
  "/bracelets/:nfcUid",
  requireRole("bank", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, req.params.nfcUid as string));
    if (!existing) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    // event_admin may only update bracelets belonging to their own event
    if (req.user!.role === "event_admin") {
      if (!req.user!.eventId || existing.eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Access denied: bracelet does not belong to your event" });
        return;
      }
      // event_admin may not update PII (bank/admin only); only maxOfflineSpend is permitted
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.maxOfflineSpend !== undefined) updates.maxOfflineSpend = parsed.data.maxOfflineSpend;
      const [updated] = await db
        .update(braceletsTable)
        .set(updates)
        .where(eq(braceletsTable.nfcUid, req.params.nfcUid as string))
        .returning();
      res.json(updated);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.attendeeName !== undefined) updates.attendeeName = parsed.data.attendeeName;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email;
    if (parsed.data.maxOfflineSpend !== undefined) updates.maxOfflineSpend = parsed.data.maxOfflineSpend;

    const [updated] = await db
      .update(braceletsTable)
      .set(updates)
      .where(eq(braceletsTable.nfcUid, req.params.nfcUid as string))
      .returning();

    res.json(updated);
  },
);

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
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

router.get(
  "/bracelets/:nfcUid",
  requireRole("bank", "admin", "merchant_staff", "merchant_admin"),
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

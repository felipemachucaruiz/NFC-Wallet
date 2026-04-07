import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable, transactionLogsTable, locationsTable, merchantsTable, topUpsTable, usersTable, accessZonesTable } from "@workspace/db";
import { eq, desc, ilike, or, and, sql, asc } from "drizzle-orm";
import { requireRole, requireAuth } from "../middlewares/requireRole";
import { z } from "zod";
import { notifyBraceletUnblocked } from "../lib/pushNotifications";

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

/**
 * @summary List all bracelets with pagination and filtering (admin only)
 */
router.get(
  "/admin/bracelets",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(Math.max(1, parseInt((req.query.limit as string) || "50", 10)), 100);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string | undefined)?.trim();
    const eventId = req.query.eventId as string | undefined;
    const flaggedParam = req.query.flagged as string | undefined;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(braceletsTable.nfcUid, `%${search}%`),
          ilike(braceletsTable.attendeeName, `%${search}%`),
        ),
      );
    }
    if (eventId) conditions.push(eq(braceletsTable.eventId, eventId));
    if (flaggedParam === "true") conditions.push(eq(braceletsTable.flagged, true));
    if (flaggedParam === "false") conditions.push(eq(braceletsTable.flagged, false));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [bracelets, countResult] = await Promise.all([
      db
        .select({
          id: braceletsTable.id,
          nfcUid: braceletsTable.nfcUid,
          eventId: braceletsTable.eventId,
          eventName: sql<string | null>`(SELECT name FROM events WHERE id = ${braceletsTable.eventId})`,
          attendeeUserId: braceletsTable.attendeeUserId,
          attendeeName: braceletsTable.attendeeName,
          phone: braceletsTable.phone,
          email: braceletsTable.email,
          lastKnownBalanceCop: braceletsTable.lastKnownBalanceCop,
          lastCounter: braceletsTable.lastCounter,
          maxOfflineSpend: braceletsTable.maxOfflineSpend,
          flagged: braceletsTable.flagged,
          flagReason: braceletsTable.flagReason,
          pendingSync: braceletsTable.pendingSync,
          pendingBalanceCop: braceletsTable.pendingBalanceCop,
          accessZoneIds: braceletsTable.accessZoneIds,
          registeredByUserId: braceletsTable.registeredByUserId,
          createdAt: braceletsTable.createdAt,
          updatedAt: braceletsTable.updatedAt,
          lastLocationName: sql<string | null>`(SELECT l.name FROM transaction_logs tl LEFT JOIN locations l ON tl.location_id = l.id WHERE tl.bracelet_uid = ${braceletsTable.nfcUid} ORDER BY tl.created_at DESC LIMIT 1)`,
        })
        .from(braceletsTable)
        .where(where)
        .orderBy(desc(braceletsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(braceletsTable)
        .where(where),
    ]);

    const total = countResult[0]?.total ?? 0;
    res.json({ bracelets, total, page, pages: Math.ceil(total / limit) });
  },
);

router.post(
  "/bracelets",
  requireRole("bank", "admin", "gate"),
  async (req: Request, res: Response) => {
    const parsed = registerBraceletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { nfcUid, attendeeName, phone, email, maxOfflineSpend } = parsed.data;
    let { eventId } = parsed.data;

    // Gate users are scoped to their assigned event — enforce it
    if (req.user!.role === "gate") {
      if (!req.user!.eventId) {
        res.status(403).json({ error: "Gate user is not assigned to an event" });
        return;
      }
      // Gate users may only register bracelets for their own event
      if (eventId && eventId !== req.user!.eventId) {
        res.status(403).json({ error: "Access denied: you may only register bracelets for your assigned event" });
        return;
      }
      eventId = req.user!.eventId;
    }

    const existing = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));
    if (existing.length > 0) {
      const b = existing[0];
      // Build rich already-registered info
      let zoneName: string | null = null;
      let zoneColor: string | null = null;
      if (b.accessZoneIds && b.accessZoneIds.length > 0) {
        const [zone] = await db
          .select({ name: accessZonesTable.name, colorHex: accessZonesTable.colorHex })
          .from(accessZonesTable)
          .where(eq(accessZonesTable.id, b.accessZoneIds[0]));
        zoneName = zone?.name ?? null;
        zoneColor = zone?.colorHex ?? null;
      }
      let registeredByUsername: string | null = null;
      if (b.registeredByUserId) {
        const [registrar] = await db
          .select({ username: usersTable.username, firstName: usersTable.firstName })
          .from(usersTable)
          .where(eq(usersTable.id, b.registeredByUserId));
        registeredByUsername = registrar?.username ?? registrar?.firstName ?? null;
      }
      res.status(409).json({
        error: "BRACELET_ALREADY_REGISTERED",
        registrationInfo: {
          zoneName,
          zoneColor,
          registeredAt: b.createdAt,
          registeredByUsername,
        },
      });
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

    // Gate zone auto-assignment: fetch the acting user's gateZoneId from DB (not session cache)
    const initialAccessZoneIds: string[] = [];
    const [actingUser] = await db
      .select({ gateZoneId: usersTable.gateZoneId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (actingUser?.gateZoneId) {
      initialAccessZoneIds.push(actingUser.gateZoneId);
    }

    const [bracelet] = await db
      .insert(braceletsTable)
      .values({
        nfcUid,
        eventId,
        attendeeName,
        phone,
        email,
        maxOfflineSpend: resolvedMaxOfflineSpend,
        accessZoneIds: initialAccessZoneIds,
        registeredByUserId: req.user!.id,
      })
      .returning();
    res.status(201).json(bracelet);
  },
);

/**
 * @summary Get banned/flagged bracelets for an event (gate staff use to cache locally)
 */
router.get(
  "/bracelets/banned",
  requireRole("gate", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const eventId = req.query.eventId as string | undefined;

    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    // Gate users may only query their own assigned event
    if (req.user!.role === "gate" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied: you may only query your assigned event" });
      return;
    }

    const banned = await db
      .select({
        nfcUid: braceletsTable.nfcUid,
        flagReason: braceletsTable.flagReason,
        attendeeName: braceletsTable.attendeeName,
        updatedAt: braceletsTable.updatedAt,
      })
      .from(braceletsTable)
      .where(and(eq(braceletsTable.eventId, eventId), eq(braceletsTable.flagged, true)))
      .orderBy(asc(braceletsTable.nfcUid));

    res.json({ banned });
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

    const [charges, topups] = await Promise.all([
      db
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
        .limit(limit),
      db
        .select({
          id: topUpsTable.id,
          grossAmountCop: topUpsTable.amountCop,
          newBalanceCop: topUpsTable.newBalanceCop,
          createdAt: topUpsTable.createdAt,
          offlineCreatedAt: topUpsTable.offlineCreatedAt,
          agentFirstName: usersTable.firstName,
          agentLastName: usersTable.lastName,
          paymentMethod: topUpsTable.paymentMethod,
        })
        .from(topUpsTable)
        .leftJoin(usersTable, eq(topUpsTable.performedByUserId, usersTable.id))
        .where(eq(topUpsTable.braceletUid, nfcUid))
        .orderBy(desc(topUpsTable.createdAt))
        .limit(limit),
    ]);

    const chargeRows = charges.map((c) => ({
      id: c.id,
      type: "charge" as const,
      grossAmountCop: c.grossAmountCop,
      newBalanceCop: c.newBalanceCop,
      createdAt: c.createdAt,
      offlineCreatedAt: c.offlineCreatedAt,
      merchantName: c.merchantName ?? null,
      locationName: c.locationName ?? null,
    }));

    const topupRows = topups.map((t) => ({
      id: t.id,
      type: "topup" as const,
      grossAmountCop: t.grossAmountCop,
      newBalanceCop: t.newBalanceCop,
      createdAt: t.createdAt,
      offlineCreatedAt: t.offlineCreatedAt,
      merchantName: [t.agentFirstName, t.agentLastName].filter(Boolean).join(" ") || null,
      locationName: t.paymentMethod ?? null,
    }));

    const transactions = [...chargeRows, ...topupRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    res.json({ transactions });
  },
);

/**
 * @summary Flag (freeze) a bracelet
 */
router.patch(
  "/admin/bracelets/:nfcUid/flag",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const { reason } = req.body as { reason?: string };
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
      .set({ flagged: true, flagReason: reason || "Frozen by admin", updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, nfcUid))
      .returning();
    res.json(updated);
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
    void notifyBraceletUnblocked(nfcUid).catch(() => {});
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

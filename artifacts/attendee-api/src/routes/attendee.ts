import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  braceletsTable,
  transactionLogsTable,
  transactionLineItemsTable,
  topUpsTable,
  locationsTable,
  merchantsTable,
  eventsTable,
  attendeeRefundRequestsTable,
  braceletTransferLogsTable,
  usersTable,
  ticketsTable,
  ticketOrdersTable,
  ticketTypesTable,
  venueSectionsTable,
  eventDaysTable,
} from "@workspace/db";
import { eq, and, ne, desc, inArray, lte, sql, gt } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { notifyBraceletBlocked } from "../lib/pushNotifications";
import { deleteSession, getSessionId, SESSION_COOKIE } from "../lib/auth";
import { buildAppleWalletUrl } from "./appleWallet";
import { generateGoogleWalletSaveLink } from "../lib/walletPasses";

const router: IRouter = Router();

router.get(
  "/attendee/me/bracelets",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const bracelets = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.attendeeUserId, userId), eq(braceletsTable.flagged, false)));

    // Batch-fetch events and pending refunds to avoid N+1 queries
    const braceletUids = bracelets.map((b) => b.nfcUid);
    const eventIds = [...new Set(bracelets.map((b) => b.eventId).filter(Boolean) as string[])];

    const [eventsRows, refundRows] = await Promise.all([
      eventIds.length > 0
        ? db
            .select({ id: eventsTable.id, name: eventsTable.name, active: eventsTable.active, endsAt: eventsTable.endsAt, refundDeadline: eventsTable.refundDeadline, currencyCode: eventsTable.currencyCode })
            .from(eventsTable)
            .where(inArray(eventsTable.id, eventIds))
        : Promise.resolve([]),
      braceletUids.length > 0
        ? db
            .select({
              braceletUid: attendeeRefundRequestsTable.braceletUid,
              status: attendeeRefundRequestsTable.status,
              createdAt: attendeeRefundRequestsTable.createdAt,
            })
            .from(attendeeRefundRequestsTable)
            .where(inArray(attendeeRefundRequestsTable.braceletUid, braceletUids))
            .orderBy(desc(attendeeRefundRequestsTable.createdAt))
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const eventsById = new Map(eventsRows.map((ev) => [ev.id, {
      id: ev.id,
      name: ev.name,
      active: ev.active && (!ev.endsAt || ev.endsAt > now),
      refundDeadline: ev.refundDeadline?.toISOString() ?? null,
    }]));

    const refundStatusByUid = new Map<string, string>();
    for (const row of refundRows) {
      if (!refundStatusByUid.has(row.braceletUid)) {
        refundStatusByUid.set(row.braceletUid, row.status);
      }
    }

    const result = bracelets.map((b) => {
      const event = b.eventId ? (eventsById.get(b.eventId) ?? null) : null;
      const refundStatus = refundStatusByUid.get(b.nfcUid) ?? null;
      return {
        uid: b.nfcUid,
        balance: b.lastKnownBalance,
        pendingTopUpAmount: b.pendingTopUpAmount ?? 0,
        flagged: b.flagged,
        flagReason: b.flagReason,
        pendingRefund: refundStatus !== null && refundStatus !== "rejected",
        refundStatus,
        attendeeName: b.attendeeName,
        event,
        updatedAt: b.updatedAt,
      };
    });

    res.json({ bracelets: result });
  }
);

const PAGE_SIZE = 20;

function encodeCursor(createdAt: Date, id: string, type: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id, ty: type })).toString("base64url");
}

function decodeCursor(cursor: string): { t: Date; id: string; ty: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t: string; id: string; ty: string };
    const d = new Date(parsed.t);
    if (isNaN(d.getTime())) return null;
    return { t: d, id: parsed.id, ty: parsed.ty };
  } catch {
    return null;
  }
}

router.get(
  "/attendee/me/transactions",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const cursorRaw = req.query.cursor as string | undefined;
    const limitRaw = parseInt((req.query.limit as string) ?? String(PAGE_SIZE), 10);
    const limit = Math.min(Math.max(1, Number.isNaN(limitRaw) ? PAGE_SIZE : limitRaw), 50);

    const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;

    if (cursorRaw && !decoded) {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }

    const bracelets = await db
      .select({ nfcUid: braceletsTable.nfcUid, eventId: braceletsTable.eventId })
      .from(braceletsTable)
      .where(eq(braceletsTable.attendeeUserId, userId));

    const currentUids = new Set(bracelets.map((b) => b.nfcUid));

    // Historical ownership: bracelet_transfer_logs records each unlink with its timestamp.
    // We use the latest unlink date per bracelet as the cutoff — transactions after that
    // belong to whoever linked the bracelet next.
    const historicalTransfers = await db
      .select({ braceletUid: braceletTransferLogsTable.braceletUid, createdAt: braceletTransferLogsTable.createdAt })
      .from(braceletTransferLogsTable)
      .where(eq(braceletTransferLogsTable.fromUserId, userId));

    const historicalCutoffs = new Map<string, Date>();
    for (const t of historicalTransfers) {
      const existing = historicalCutoffs.get(t.braceletUid);
      if (!existing || t.createdAt > existing) historicalCutoffs.set(t.braceletUid, t.createdAt);
    }

    const pureHistoricalUids = [...historicalCutoffs.keys()].filter((uid) => !currentUids.has(uid));

    const historicalBracelets = pureHistoricalUids.length > 0
      ? await db
          .select({ nfcUid: braceletsTable.nfcUid, eventId: braceletsTable.eventId })
          .from(braceletsTable)
          .where(inArray(braceletsTable.nfcUid, pureHistoricalUids))
      : [];

    const allBracelets = [...bracelets, ...historicalBracelets];
    const uids = allBracelets.map((b) => b.nfcUid);

    const txEventIds = [...new Set(allBracelets.map((b) => b.eventId).filter(Boolean) as string[])];
    const txEvents = txEventIds.length > 0
      ? await db.select({ id: eventsTable.id, name: eventsTable.name }).from(eventsTable).where(inArray(eventsTable.id, txEventIds))
      : [];
    const txEventsById = new Map(txEvents.map((e) => [e.id, e.name]));
    const uidToEvent = new Map(allBracelets.map((b) => [b.nfcUid, b.eventId ? { eventId: b.eventId, eventName: txEventsById.get(b.eventId) ?? null } : null]));

    const isBeforeOwnershipCutoff = (braceletUid: string, createdAt: Date) => {
      if (currentUids.has(braceletUid)) return true;
      const cutoff = historicalCutoffs.get(braceletUid);
      return cutoff ? createdAt <= cutoff : true;
    };

    const rawTxLogRows = uids.length > 0
      ? await db
          .select()
          .from(transactionLogsTable)
          .where(
            and(
              inArray(transactionLogsTable.braceletUid, uids),
              decoded ? lte(transactionLogsTable.createdAt, decoded.t) : undefined
            )
          )
          .orderBy(desc(transactionLogsTable.createdAt))
          .limit(limit * 4)
      : [];
    const txLogRows = rawTxLogRows.filter((tx) => isBeforeOwnershipCutoff(tx.braceletUid, tx.createdAt));

    const rawTopUpRows = uids.length > 0
      ? await db
          .select()
          .from(topUpsTable)
          .where(
            and(
              inArray(topUpsTable.braceletUid, uids),
              decoded ? lte(topUpsTable.createdAt, decoded.t) : undefined
            )
          )
          .orderBy(desc(topUpsTable.createdAt))
          .limit(limit * 4)
      : [];
    const topUpRows = rawTopUpRows.filter((tu) => isBeforeOwnershipCutoff(tu.braceletUid, tu.createdAt));

    const refundRows = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .where(
        and(
          eq(attendeeRefundRequestsTable.attendeeUserId, userId),
          decoded ? lte(attendeeRefundRequestsTable.createdAt, decoded.t) : undefined
        )
      )
      .orderBy(desc(attendeeRefundRequestsTable.createdAt))
      .limit(limit * 2);

    const transferRows = await db
      .select()
      .from(braceletTransferLogsTable)
      .where(
        and(
          eq(braceletTransferLogsTable.fromUserId, userId),
          decoded ? lte(braceletTransferLogsTable.createdAt, decoded.t) : undefined
        )
      )
      .orderBy(desc(braceletTransferLogsTable.createdAt))
      .limit(limit * 2);

    type MergedItem = { id: string; createdAt: Date; type: "purchase" | "top_up" | "refund" | "transfer"; sortKey: string; raw: typeof txLogRows[0] | typeof topUpRows[0] | typeof refundRows[0] | typeof transferRows[0] };

    const buildSortKey = (createdAt: Date, type: string, id: string) =>
      `${createdAt.toISOString()}|${type}|${id}`;

    let merged: MergedItem[] = [
      ...txLogRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "purchase" as const, sortKey: buildSortKey(r.createdAt, "purchase", r.id), raw: r })),
      ...topUpRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "top_up" as const, sortKey: buildSortKey(r.createdAt, "top_up", r.id), raw: r })),
      ...refundRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "refund" as const, sortKey: buildSortKey(r.createdAt, "refund", r.id), raw: r })),
      ...transferRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "transfer" as const, sortKey: buildSortKey(r.createdAt, "transfer", r.id), raw: r })),
    ].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.type !== b.type) return b.type.localeCompare(a.type);
      return b.id.localeCompare(a.id);
    });

    if (decoded) {
      const cursorKey = buildSortKey(decoded.t, decoded.ty, decoded.id);
      merged = merged.filter((item) => item.sortKey < cursorKey);
    }

    const hasMore = merged.length > limit;
    const page = merged.slice(0, limit);

    const txWithDetails = await Promise.all(
      page.map(async (item) => {
        if (item.type === "purchase") {
          const tx = item.raw as typeof txLogRows[0];
          const [lineItems, [location], [merchant]] = await Promise.all([
            db.select().from(transactionLineItemsTable).where(eq(transactionLineItemsTable.transactionLogId, tx.id)),
            db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, tx.locationId)),
            db.select({ name: merchantsTable.name }).from(merchantsTable).where(eq(merchantsTable.id, tx.merchantId)),
          ]);
          return {
            id: tx.id,
            type: "purchase" as const,
            braceletUid: tx.braceletUid,
            amount: tx.grossAmount,
            newBalance: tx.newBalance,
            merchantName: merchant?.name ?? null,
            locationName: location?.name ?? null,
            eventId: uidToEvent.get(tx.braceletUid)?.eventId ?? null,
            eventName: uidToEvent.get(tx.braceletUid)?.eventName ?? null,
            lineItems: lineItems.map((li) => ({
              name: li.productNameSnapshot,
              quantity: li.quantity,
              unitPrice: li.unitPriceSnapshot,
            })),
            createdAt: tx.createdAt,
            refundStatus: null,
          };
        } else if (item.type === "refund") {
          const ref = item.raw as typeof refundRows[0];
          return {
            id: ref.id,
            type: "refund" as const,
            braceletUid: ref.braceletUid,
            amount: ref.amount,
            newBalance: 0,
            merchantName: null,
            locationName: null,
            eventId: uidToEvent.get(ref.braceletUid)?.eventId ?? null,
            eventName: uidToEvent.get(ref.braceletUid)?.eventName ?? null,
            lineItems: [],
            createdAt: ref.createdAt,
            refundStatus: ref.status,
            refundChipZeroed: ref.chipZeroed,
          };
        } else if (item.type === "transfer") {
          const tr = item.raw as typeof transferRows[0];
          return {
            id: tr.id,
            type: "transfer" as const,
            braceletUid: tr.braceletUid,
            amount: tr.balance,
            newBalance: 0,
            merchantName: null,
            locationName: null,
            eventId: uidToEvent.get(tr.braceletUid)?.eventId ?? null,
            eventName: uidToEvent.get(tr.braceletUid)?.eventName ?? null,
            lineItems: [],
            createdAt: tr.createdAt,
            refundStatus: null,
          };
        } else {
          const tu = item.raw as typeof topUpRows[0];
          return {
            id: tu.id,
            type: "top_up" as const,
            braceletUid: tu.braceletUid,
            amount: tu.amount,
            newBalance: tu.newBalance,
            merchantName: null,
            locationName: null,
            eventId: uidToEvent.get(tu.braceletUid)?.eventId ?? null,
            eventName: uidToEvent.get(tu.braceletUid)?.eventName ?? null,
            lineItems: [],
            createdAt: tu.createdAt,
            refundStatus: null,
          };
        }
      })
    );

    const lastItem = page[page.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.createdAt, lastItem.id, lastItem.type)
      : null;

    res.json({ transactions: txWithDetails, nextCursor });
  }
);

/**
 * Haversine distance in metres between two lat/lon points
 */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @summary Get nearby active events sorted by distance from given coordinates.
 * Events without coordinates are appended at the end.
 * Requires attendee auth.
 */
router.get(
  "/attendee/events/nearby",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const latRaw = req.query.lat as string | undefined;
    const lngRaw = req.query.lng as string | undefined;

    if ((latRaw !== undefined) !== (lngRaw !== undefined)) {
      res.status(400).json({ error: "Both lat and lng must be provided together" });
      return;
    }

    const userLat = latRaw !== undefined ? parseFloat(latRaw) : null;
    const userLng = lngRaw !== undefined ? parseFloat(lngRaw) : null;

    if (userLat !== null && (isNaN(userLat) || userLat < -90 || userLat > 90)) {
      res.status(400).json({ error: "lat must be a valid number between -90 and 90" });
      return;
    }
    if (userLng !== null && (isNaN(userLng) || userLng < -180 || userLng > 180)) {
      res.status(400).json({ error: "lng must be a valid number between -180 and 180" });
      return;
    }

    const hasCoords = userLat !== null && userLng !== null;

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        venueAddress: eventsTable.venueAddress,
        currencyCode: eventsTable.currencyCode,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        latitude: eventsTable.latitude,
        longitude: eventsTable.longitude,
      })
      .from(eventsTable)
      .where(and(
        eq(eventsTable.active, true),
        sql`(${eventsTable.endsAt} IS NULL OR ${eventsTable.endsAt} > NOW())`,
      ));

    type EventRow = typeof events[0];
    type EventWithDistance = EventRow & { distanceMetres: number | null };

    const withDistance: EventWithDistance[] = events.map((ev) => {
      const lat = ev.latitude !== null ? parseFloat(ev.latitude as string) : null;
      const lng = ev.longitude !== null ? parseFloat(ev.longitude as string) : null;
      const distanceMetres =
        hasCoords && lat !== null && lng !== null
          ? haversineMetres(userLat!, userLng!, lat, lng)
          : null;
      return { ...ev, distanceMetres };
    });

    withDistance.sort((a, b) => {
      if (a.distanceMetres === null && b.distanceMetres === null) return 0;
      if (a.distanceMetres === null) return 1;
      if (b.distanceMetres === null) return -1;
      return a.distanceMetres - b.distanceMetres;
    });

    res.json({ events: withDistance });
  }
);

const linkBraceletSchema = z.object({
  uid: z.string().min(1),
  attendeeName: z.string().optional(),
  eventId: z.string().optional(),
});

function normalizeUidLocal(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const VALID_HEX_LENGTHS = new Set([8, 14, 20]);
  if (!VALID_HEX_LENGTHS.has(hex.length)) return null;
  return hex.match(/.{2}/g)!.join(":");
}

router.post(
  "/attendee/me/bracelets/link",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const parsed = linkBraceletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "uid is required" });
      return;
    }

    const uid = normalizeUidLocal(parsed.data.uid);
    if (!uid) {
      res.status(400).json({ error: "Invalid UID format. Must be 4, 7, or 10 hex bytes." });
      return;
    }

    const requestedEventId = parsed.data.eventId ?? null;

    let [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, uid));

    if (!bracelet) {
      // Stub auto-create: bracelet has never been registered anywhere
      // eventId is required so the stub is associated with the correct event
      if (!requestedEventId) {
        res.status(400).json({ error: "BRACELET_NOT_FOUND", needsEventSelection: true });
        return;
      }
      const [created] = await db
        .insert(braceletsTable)
        .values({
          nfcUid: uid,
          eventId: requestedEventId,
          lastKnownBalance: 0,
          lastCounter: 0,
          pendingSync: false,
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        bracelet = created;
      } else {
        const [existing] = await db.select().from(braceletsTable).where(eq(braceletsTable.nfcUid, uid));
        bracelet = existing;
      }
    }

    if (!bracelet) {
      res.status(500).json({ error: "Failed to resolve bracelet" });
      return;
    }

    if (bracelet.attendeeUserId && bracelet.attendeeUserId !== userId) {
      res.status(409).json({ error: "BRACELET_ALREADY_LINKED" });
      return;
    }

    if (bracelet.flagged) {
      res.status(403).json({ error: "BRACELET_FLAGGED" });
      return;
    }

    // Fetch the authenticated user to auto-populate bracelet owner info
    const [user] = await db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;

    const updates: Partial<typeof braceletsTable.$inferInsert> = {
      attendeeUserId: userId,
      updatedAt: new Date(),
      // Auto-fill owner info from the authenticated user account
      attendeeName: fullName ?? parsed.data.attendeeName ?? undefined,
      email: user?.email ?? undefined,
      phone: user?.phone ?? undefined,
    };

    // One bracelet per event per user — prevents a bad actor from linking
    // another person's bracelet and claiming their refund.
    // Exception: if the conflicting bracelet is flagged (blocked), allow replacement
    // and automatically transfer its balance to the new bracelet.
    if (bracelet.eventId) {
      const [eventConflict] = await db
        .select()
        .from(braceletsTable)
        .where(
          and(
            eq(braceletsTable.attendeeUserId, userId),
            eq(braceletsTable.eventId, bracelet.eventId),
            ne(braceletsTable.nfcUid, uid)
          )
        );
      if (eventConflict) {
        if (!eventConflict.flagged) {
          res.status(409).json({ error: "ONE_BRACELET_PER_EVENT" });
          return;
        }

        // Blocked bracelet replacement: transfer balance to the new bracelet
        const transferredBalance =
          (eventConflict.lastKnownBalance ?? 0) + (eventConflict.pendingTopUpAmount ?? 0);

        // Archive the blocked bracelet: zero its balance and mark as replaced
        await db
          .update(braceletsTable)
          .set({ lastKnownBalance: 0, pendingTopUpAmount: 0, flagReason: "replaced", updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, eventConflict.nfcUid));

        // Put transferred balance into new bracelet's pendingTopUpAmount (gate will write to chip)
        updates.pendingTopUpAmount = (bracelet.pendingTopUpAmount ?? 0) + transferredBalance;

        const [linked] = await db
          .update(braceletsTable)
          .set(updates)
          .where(eq(braceletsTable.nfcUid, uid))
          .returning();

        res.json({
          uid: linked.nfcUid,
          balance: linked.lastKnownBalance,
          attendeeName: linked.attendeeName,
          transferredFromBlocked: transferredBalance,
        });
        return;
      }
    }

    const [updated] = await db
      .update(braceletsTable)
      .set(updates)
      .where(eq(braceletsTable.nfcUid, uid))
      .returning();

    res.json({
      uid: updated.nfcUid,
      balance: updated.lastKnownBalance,
      attendeeName: updated.attendeeName,
    });
  }
);

router.post(
  "/attendee/me/bracelets/:uid/block",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const rawUid = (req.params as { uid: string }).uid;

    const uid = normalizeUidLocal(rawUid);
    if (!uid) {
      res.status(400).json({ error: "Invalid UID format. Must be 4, 7, or 10 hex bytes." });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.nfcUid, uid), eq(braceletsTable.attendeeUserId, userId)));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found or not linked to your account" });
      return;
    }

    if (bracelet.flagged) {
      res.status(409).json({ error: "Bracelet is already blocked" });
      return;
    }

    const reasonSchema = z.object({ reason: z.string().optional() });
    const parsed = reasonSchema.safeParse(req.body);
    const reason = parsed.success ? (parsed.data.reason ?? "Blocked by attendee") : "Blocked by attendee";

    const [updated] = await db
      .update(braceletsTable)
      .set({ flagged: true, flagReason: reason, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, uid))
      .returning();

    void notifyBraceletBlocked(uid).catch(() => {});

    res.json({ bracelet: updated });
  }
);

const refundMethodValues = ["cash", "nequi", "bancolombia", "bank_transfer", "other"] as const;

const attendeeRefundRequestSchema = z.object({
  braceletUid: z.string().min(1),
  refundMethod: z.enum(refundMethodValues),
  accountDetails: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  "/attendee/me/refund-request",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const parsed = attendeeRefundRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { braceletUid, refundMethod, accountDetails, notes } = parsed.data;

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.nfcUid, braceletUid), eq(braceletsTable.attendeeUserId, userId)));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found or not linked to your account" });
      return;
    }

    if (bracelet.lastKnownBalance <= 0) {
      res.status(400).json({ error: "Bracelet has no balance to refund" });
      return;
    }

    if (!bracelet.eventId) {
      res.status(400).json({ error: "Bracelet is not associated with an event" });
      return;
    }

    const [event] = await db
      .select({ refundDeadline: eventsTable.refundDeadline })
      .from(eventsTable)
      .where(eq(eventsTable.id, bracelet.eventId));

    if (event?.refundDeadline && new Date() > event.refundDeadline) {
      res.status(403).json({ error: "REFUND_DEADLINE_PASSED" });
      return;
    }

    // Prevent refund requests on bracelets blocked for non-refund reasons.
    // A bracelet flagged as "refund_pending" already has a pending request (caught below).
    // Any other block reason (fraud, admin, attendee-initiated) should not be overwritten.
    if (bracelet.flagged && bracelet.flagReason !== "refund_pending") {
      res.status(403).json({ error: "BRACELET_BLOCKED" });
      return;
    }

    // Block duplicate pending requests for the same bracelet
    const [pendingRequest] = await db
      .select({ id: attendeeRefundRequestsTable.id })
      .from(attendeeRefundRequestsTable)
      .where(
        and(
          eq(attendeeRefundRequestsTable.braceletUid, braceletUid),
          eq(attendeeRefundRequestsTable.status, "pending")
        )
      );
    if (pendingRequest) {
      res.status(409).json({ error: "REFUND_REQUEST_ALREADY_PENDING" });
      return;
    }

    try {
      const [request] = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(attendeeRefundRequestsTable)
          .values({
            attendeeUserId: userId,
            braceletUid,
            eventId: bracelet.eventId!,
            amount: bracelet.lastKnownBalance ?? 0,
            refundMethod,
            accountDetails,
            notes,
            status: "pending",
          })
          .returning();

        await tx
          .update(braceletsTable)
          .set({ flagged: true, flagReason: "refund_pending", updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, braceletUid));

        return [inserted];
      });

      res.status(201).json({ request });
    } catch (e: unknown) {
      // PostgreSQL unique-violation (23505) from the partial unique index
      // uniq_pending_refund_per_bracelet — means a concurrent request slipped
      // through the pre-insert check; treat the same as a detected duplicate.
      const err = e as { code?: string; message?: string };
      if (err.code === "23505") {
        res.status(409).json({ error: "REFUND_REQUEST_ALREADY_PENDING" });
        return;
      }
      throw e;
    }
  }
);

router.delete(
  "/attendee/me/bracelets/:uid",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const rawUid = (req.params as { uid: string }).uid;

    const uid = normalizeUidLocal(rawUid);
    if (!uid) {
      res.status(400).json({ error: "Invalid UID format. Must be 4, 7, or 10 hex bytes." });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.nfcUid, uid), eq(braceletsTable.attendeeUserId, userId)));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found or not linked to your account" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(braceletsTable)
        .set({
          attendeeUserId: null,
          attendeeName: null,
          email: null,
          phone: null,
          updatedAt: new Date(),
        })
        .where(eq(braceletsTable.nfcUid, uid));

      await tx.insert(braceletTransferLogsTable).values({
        braceletUid: uid,
        fromUserId: userId,
        balance: bracelet.lastKnownBalance,
      });
    });

    res.json({ success: true, uid, balance: bracelet.lastKnownBalance });
  }
);

router.get(
  "/attendee/me/refund-requests",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const refundRequests = await db
      .select({
        id: attendeeRefundRequestsTable.id,
        braceletUid: attendeeRefundRequestsTable.braceletUid,
        eventId: attendeeRefundRequestsTable.eventId,
        eventName: eventsTable.name,
        refundMethod: attendeeRefundRequestsTable.refundMethod,
        amount: attendeeRefundRequestsTable.amount,
        status: attendeeRefundRequestsTable.status,
        chipZeroed: attendeeRefundRequestsTable.chipZeroed,
        accountDetails: attendeeRefundRequestsTable.accountDetails,
        notes: attendeeRefundRequestsTable.notes,
        createdAt: attendeeRefundRequestsTable.createdAt,
      })
      .from(attendeeRefundRequestsTable)
      .leftJoin(eventsTable, eq(attendeeRefundRequestsTable.eventId, eventsTable.id))
      .where(eq(attendeeRefundRequestsTable.attendeeUserId, userId))
      .orderBy(desc(attendeeRefundRequestsTable.createdAt));

    res.json({ refundRequests });
  }
);

const pushTokenSchema = z.object({
  token: z.string().min(1),
});

router.post(
  "/attendee/me/push-token",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "token is required" });
      return;
    }

    await db
      .update(usersTable)
      .set({ expoPushToken: parsed.data.token, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));

    res.json({ success: true });
  }
);

const walletPlatformSchema = z.object({
  platform: z.enum(["apple", "google"]),
});

router.post(
  "/attendee/tickets/:ticketId/wallet",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ticketId } = req.params as { ticketId: string };
    const parsed = walletPlatformSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "platform is required (apple | google)" });
      return;
    }
    const { platform } = parsed.data;

    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.attendeeUserId !== req.user!.id) {
      if (ticket.orderId) {
        const [order] = await db.select({ buyerUserId: ticketOrdersTable.buyerUserId }).from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId));
        if (!order || order.buyerUserId !== req.user!.id) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      } else {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    if (platform === "apple") {
      const appUrl = (process.env.APP_URL || "https://attendee.tapee.app/attendee-api").replace(/\/$/, "");
      const passUrl = buildAppleWalletUrl(ticketId, appUrl);
      res.json({ passUrl });
      return;
    }

    if (platform === "google") {
      const [event] = ticket.orderId
        ? await db.select({ name: eventsTable.name, startsAt: eventsTable.startsAt, venueAddress: eventsTable.venueAddress, coverImageUrl: eventsTable.coverImageUrl })
            .from(eventsTable)
            .innerJoin(ticketOrdersTable, eq(ticketOrdersTable.eventId, eventsTable.id))
            .where(eq(ticketOrdersTable.id, ticket.orderId!))
        : [];

      let sectionName = "General";
      let ticketTypeName = "";
      let validDays: string[] = [];

      if (ticket.ticketTypeId) {
        const [tt] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
        if (tt) {
          ticketTypeName = tt.name;
          if (tt.sectionId) {
            const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, tt.sectionId));
            if (sec) sectionName = sec.name;
          }
          const validDayIds = ((tt as unknown as { validEventDayIds?: string[] }).validEventDayIds) ?? [];
          if (validDayIds.length > 0) {
            const days = await db.select().from(eventDaysTable).where(inArray(eventDaysTable.id, validDayIds));
            validDays = days.map((d) => (d as unknown as { label?: string; date?: string }).label || (d as unknown as { date?: string }).date || "");
          }
        }
      }

      const passUrl = generateGoogleWalletSaveLink({
        ticketId: ticket.id,
        eventName: event?.name ?? "Evento",
        eventDate: event?.startsAt?.toISOString().split("T")[0] ?? "",
        venueName: event?.venueAddress ?? "",
        venueAddress: event?.venueAddress ?? "",
        sectionName,
        attendeeName: ticket.attendeeName ?? "Asistente",
        qrCodeToken: ticket.qrCodeToken ?? ticket.id,
        validDays,
        flyerUrl: event?.coverImageUrl ?? null,
      });

      if (!passUrl) {
        res.status(503).json({ error: "Google Wallet not configured" });
        return;
      }

      res.json({ passUrl });
      return;
    }

    res.status(400).json({ error: "Invalid platform" });
  },
);

router.post(
  "/attendee/me/bracelets/:uid/claim-wallet-balance",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const rawUid = (req.params as { uid: string }).uid;
    const uid = normalizeUidLocal(rawUid);
    if (!uid) {
      res.status(400).json({ error: "Invalid UID format" });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(and(eq(braceletsTable.nfcUid, uid), eq(braceletsTable.attendeeUserId, userId)));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found or not linked to your account" });
      return;
    }

    const [user] = await db
      .select({ pendingWalletBalance: usersTable.pendingWalletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const amount = user?.pendingWalletBalance ?? 0;
    if (amount <= 0) {
      res.json({ transferred: 0 });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ pendingWalletBalance: 0, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));

      await tx
        .update(braceletsTable)
        .set({
          pendingTopUpAmount: sql`${braceletsTable.pendingTopUpAmount} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(braceletsTable.nfcUid, uid));
    });

    res.json({ transferred: amount });
  }
);

router.delete(
  "/attendee/me",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(braceletsTable)
        .set({ attendeeUserId: null, updatedAt: now })
        .where(eq(braceletsTable.attendeeUserId, userId));

      await tx
        .update(usersTable)
        .set({
          email: `deleted_${userId}@deleted.tapee.app`,
          firstName: null,
          lastName: null,
          phone: null,
          dateOfBirth: null,
          sex: null,
          idDocument: null,
          pendingWalletBalance: 0,
          updatedAt: now,
        })
        .where(eq(usersTable.id, userId));
    });

    const sid = getSessionId(req);
    if (sid) await deleteSession(sid);
    res.clearCookie(SESSION_COOKIE, { path: "/" });

    res.json({ success: true });
  }
);

export default router;

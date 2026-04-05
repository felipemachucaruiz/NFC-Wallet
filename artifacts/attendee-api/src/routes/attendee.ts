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
  usersTable,
} from "@workspace/db";
import { eq, and, ne, desc, inArray, lte } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { notifyBraceletBlocked } from "../lib/pushNotifications";

const router: IRouter = Router();

router.get(
  "/attendee/me/bracelets",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user.id;

    const bracelets = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.attendeeUserId, userId));

    const result = await Promise.all(
      bracelets.map(async (b) => {
        let event = null;
        if (b.eventId) {
          const [ev] = await db
            .select({ id: eventsTable.id, name: eventsTable.name, active: eventsTable.active })
            .from(eventsTable)
            .where(eq(eventsTable.id, b.eventId));
          event = ev ?? null;
        }
        return {
          uid: b.nfcUid,
          balanceCop: b.lastKnownBalanceCop,
          flagged: b.flagged,
          flagReason: b.flagReason,
          attendeeName: b.attendeeName,
          event,
          updatedAt: b.updatedAt,
        };
      })
    );

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
    const userId = req.user.id;
    const cursorRaw = req.query.cursor as string | undefined;
    const limitRaw = parseInt((req.query.limit as string) ?? String(PAGE_SIZE), 10);
    const limit = Math.min(Math.max(1, Number.isNaN(limitRaw) ? PAGE_SIZE : limitRaw), 50);

    const bracelets = await db
      .select({ nfcUid: braceletsTable.nfcUid })
      .from(braceletsTable)
      .where(eq(braceletsTable.attendeeUserId, userId));

    if (bracelets.length === 0) {
      res.json({ transactions: [], nextCursor: null });
      return;
    }

    const uids = bracelets.map((b) => b.nfcUid);
    const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;

    if (cursorRaw && !decoded) {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }

    const txLogRows = await db
      .select()
      .from(transactionLogsTable)
      .where(
        and(
          inArray(transactionLogsTable.braceletUid, uids),
          decoded ? lte(transactionLogsTable.createdAt, decoded.t) : undefined
        )
      )
      .orderBy(desc(transactionLogsTable.createdAt))
      .limit(limit * 2);

    const topUpRows = await db
      .select()
      .from(topUpsTable)
      .where(
        and(
          inArray(topUpsTable.braceletUid, uids),
          decoded ? lte(topUpsTable.createdAt, decoded.t) : undefined
        )
      )
      .orderBy(desc(topUpsTable.createdAt))
      .limit(limit * 2);

    type MergedItem = { id: string; createdAt: Date; type: "purchase" | "top_up"; sortKey: string; raw: typeof txLogRows[0] | typeof topUpRows[0] };

    const buildSortKey = (createdAt: Date, type: string, id: string) =>
      `${createdAt.toISOString()}|${type}|${id}`;

    let merged: MergedItem[] = [
      ...txLogRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "purchase" as const, sortKey: buildSortKey(r.createdAt, "purchase", r.id), raw: r })),
      ...topUpRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "top_up" as const, sortKey: buildSortKey(r.createdAt, "top_up", r.id), raw: r })),
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
            amountCop: tx.grossAmountCop,
            newBalanceCop: tx.newBalanceCop,
            merchantName: merchant?.name ?? null,
            locationName: location?.name ?? null,
            lineItems: lineItems.map((li) => ({
              name: li.productNameSnapshot,
              quantity: li.quantity,
              unitPriceCop: li.unitPriceSnapshot,
            })),
            createdAt: tx.createdAt,
          };
        } else {
          const tu = item.raw as typeof topUpRows[0];
          return {
            id: tu.id,
            type: "top_up" as const,
            braceletUid: tu.braceletUid,
            amountCop: tu.amountCop,
            newBalanceCop: tu.newBalanceCop,
            merchantName: null,
            locationName: null,
            lineItems: [],
            createdAt: tu.createdAt,
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
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        latitude: eventsTable.latitude,
        longitude: eventsTable.longitude,
      })
      .from(eventsTable)
      .where(eq(eventsTable.active, true));

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
    const userId = req.user.id;

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
          lastKnownBalanceCop: 0,
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

    // One bracelet per event per user — prevents a bad actor from linking
    // another person's bracelet and claiming their refund
    if (bracelet.eventId) {
      const [eventConflict] = await db
        .select({ id: braceletsTable.id })
        .from(braceletsTable)
        .where(
          and(
            eq(braceletsTable.attendeeUserId, userId),
            eq(braceletsTable.eventId, bracelet.eventId),
            ne(braceletsTable.nfcUid, uid)
          )
        );
      if (eventConflict) {
        res.status(409).json({ error: "ONE_BRACELET_PER_EVENT" });
        return;
      }
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

    const [updated] = await db
      .update(braceletsTable)
      .set(updates)
      .where(eq(braceletsTable.nfcUid, uid))
      .returning();

    res.json({
      uid: updated.nfcUid,
      balanceCop: updated.lastKnownBalanceCop,
      attendeeName: updated.attendeeName,
    });
  }
);

router.post(
  "/attendee/me/bracelets/:uid/block",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user.id;
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

const refundMethodValues = ["cash", "nequi", "bancolombia", "other"] as const;

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
    const userId = req.user.id;

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

    if (bracelet.lastKnownBalanceCop <= 0) {
      res.status(400).json({ error: "Bracelet has no balance to refund" });
      return;
    }

    if (!bracelet.eventId) {
      res.status(400).json({ error: "Bracelet is not associated with an event" });
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
      const [request] = await db
        .insert(attendeeRefundRequestsTable)
        .values({
          attendeeUserId: userId,
          braceletUid,
          eventId: bracelet.eventId,
          amountCop: bracelet.lastKnownBalanceCop,
          refundMethod,
          accountDetails,
          notes,
          status: "pending",
        })
        .returning();

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
    const userId = req.user.id;
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

    await db
      .update(braceletsTable)
      .set({
        attendeeUserId: null,
        attendeeName: null,
        email: null,
        phone: null,
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, uid));

    res.json({ success: true, uid, balanceCop: bracelet.lastKnownBalanceCop });
  }
);

router.get(
  "/attendee/me/refund-requests",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user.id;

    const requests = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .where(eq(attendeeRefundRequestsTable.attendeeUserId, userId))
      .orderBy(desc(attendeeRefundRequestsTable.createdAt));

    res.json({ requests });
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
      .where(eq(usersTable.id, req.user.id));

    res.json({ success: true });
  }
);

export default router;

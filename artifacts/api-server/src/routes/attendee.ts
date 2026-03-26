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
} from "@workspace/db";
import { eq, and, desc, inArray, lte } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

/**
 * GET /attendee/me/bracelets
 * Returns all bracelets linked to the authenticated attendee, with balance and event info.
 */
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

/**
 * GET /attendee/me/transactions
 * Returns cursor-paginated transaction history for all bracelets linked to the attendee.
 * Query params: cursor (opaque base64url string), limit (default 20, max 50)
 */
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

    // Use lte at SQL level to include same-timestamp rows, then apply composite
    // tie-break in memory after merge (safe across two different tables).
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

    // Build a composite sort key: (createdAt DESC, type DESC, id DESC)
    // Using type in the sort ensures deterministic ordering across the two tables.
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

    // Apply composite cursor filter in memory (safe cross-table tie-break)
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
 * POST /attendee/me/bracelets/:uid/block
 * Block (flag) the attendee's bracelet so no POS can charge it.
 */
router.post(
  "/attendee/me/bracelets/:uid/block",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { uid } = req.params as { uid: string };

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

/**
 * POST /attendee/me/refund-request
 * Submit a refund request for a bracelet balance. Queued as "pending" for Bank to process.
 */
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
  }
);

/**
 * GET /attendee/me/refund-requests
 * List all refund requests for the authenticated attendee.
 */
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

/**
 * POST /bank/bracelets/:uid/link
 * Link a bracelet to an attendee account (Bank staff only).
 * Requires identity verification at the Bank station.
 * Body: { attendeeUserId: string }
 */
router.post(
  "/bank/bracelets/:uid/link",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const { uid } = req.params as { uid: string };
    const linkSchema = z.object({ attendeeUserId: z.string().min(1) });
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "attendeeUserId is required" });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, uid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (bracelet.attendeeUserId && bracelet.attendeeUserId !== parsed.data.attendeeUserId) {
      res.status(409).json({ error: "Bracelet is already linked to another account" });
      return;
    }

    const [updated] = await db
      .update(braceletsTable)
      .set({ attendeeUserId: parsed.data.attendeeUserId, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, uid))
      .returning();

    res.json({ bracelet: updated });
  }
);

/**
 * GET /bank/attendee-refund-requests
 * List all pending attendee refund requests (for Bank staff).
 */
router.get(
  "/bank/attendee-refund-requests",
  requireRole("bank", "admin", "event_admin"),
  async (req: Request, res: Response) => {
    const requests = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .orderBy(desc(attendeeRefundRequestsTable.createdAt));

    res.json({ requests });
  }
);

/**
 * POST /bank/attendee-refund-requests/:id/process
 * Approve or reject an attendee refund request (Bank staff).
 */
router.post(
  "/bank/attendee-refund-requests/:id/process",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const userId = req.user.id;

    const statusSchema = z.object({
      status: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [request] = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .where(eq(attendeeRefundRequestsTable.id, id));

    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(409).json({ error: "Request has already been processed" });
      return;
    }

    const [updated] = await db
      .update(attendeeRefundRequestsTable)
      .set({
        status: parsed.data.status,
        processedByUserId: userId,
        processedAt: new Date(),
        notes: parsed.data.notes ?? request.notes,
        updatedAt: new Date(),
      })
      .where(eq(attendeeRefundRequestsTable.id, id))
      .returning();

    if (parsed.data.status === "approved") {
      await db
        .update(braceletsTable)
        .set({ lastKnownBalanceCop: 0, updatedAt: new Date() })
        .where(eq(braceletsTable.nfcUid, request.braceletUid));
    }

    res.json({ request: updated });
  }
);

const transferSchema = z.object({
  oldUid: z.string().min(1),
  newUid: z.string().min(1),
}).refine((d) => d.oldUid !== d.newUid, { message: "Old and new bracelet UIDs must be different" });

/**
 * POST /bank/bracelets/transfer-balance
 * Transfer balance from a blocked bracelet to a new one (Bank staff).
 * The old bracelet must be flagged; the new bracelet must be registered.
 * Uses a DB transaction for atomicity.
 */
router.post(
  "/bank/bracelets/transfer-balance",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors.map((e) => e.message).join("; ") });
      return;
    }

    const { oldUid, newUid } = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        const [oldBracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, oldUid));

        if (!oldBracelet) throw new Error("Old bracelet not found");
        if (!oldBracelet.flagged) throw new Error("Old bracelet must be blocked before transferring balance");

        const [newBracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, newUid));

        if (!newBracelet) throw new Error("New bracelet not found. Register it first.");

        const transferAmount = oldBracelet.lastKnownBalanceCop;

        await tx
          .update(braceletsTable)
          .set({ lastKnownBalanceCop: 0, updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, oldUid));

        await tx
          .update(braceletsTable)
          .set({
            lastKnownBalanceCop: newBracelet.lastKnownBalanceCop + transferAmount,
            attendeeUserId: oldBracelet.attendeeUserId,
            attendeeName: oldBracelet.attendeeName,
            phone: oldBracelet.phone,
            email: oldBracelet.email,
            eventId: oldBracelet.eventId,
            updatedAt: new Date(),
          })
          .where(eq(braceletsTable.nfcUid, newUid));

        return { transferredAmountCop: transferAmount, newUid, oldUid };
      });

      res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      const status = msg.includes("not found") ? 404 : msg.includes("must be blocked") ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }
);

/**
 * POST /bank/bracelets/link-and-transfer
 * Atomically link a new bracelet to an attendee and transfer balance from
 * their old (blocked) bracelet. Uses a DB transaction for atomicity.
 *
 * Body: { oldUid: string, newUid: string }
 */
router.post(
  "/bank/bracelets/link-and-transfer",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors.map((e) => e.message).join("; ") });
      return;
    }

    const { oldUid, newUid } = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        const [oldBracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, oldUid));

        if (!oldBracelet) throw new Error("Old bracelet not found");
        if (!oldBracelet.flagged) throw new Error("Old bracelet must be blocked (flagged) before transferring");

        const [newBracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, newUid));

        if (!newBracelet) throw new Error("New bracelet not found. Register it first at the Bank.");

        if (newBracelet.attendeeUserId && newBracelet.attendeeUserId !== oldBracelet.attendeeUserId) {
          throw new Error("New bracelet is already linked to a different attendee");
        }

        const transferAmount = oldBracelet.lastKnownBalanceCop;

        await tx
          .update(braceletsTable)
          .set({ lastKnownBalanceCop: 0, updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, oldUid));

        await tx
          .update(braceletsTable)
          .set({
            lastKnownBalanceCop: newBracelet.lastKnownBalanceCop + transferAmount,
            attendeeUserId: oldBracelet.attendeeUserId,
            attendeeName: oldBracelet.attendeeName,
            phone: oldBracelet.phone,
            email: oldBracelet.email,
            eventId: oldBracelet.eventId,
            flagged: false,
            flagReason: null,
            updatedAt: new Date(),
          })
          .where(eq(braceletsTable.nfcUid, newUid));

        return {
          transferredAmountCop: transferAmount,
          newUid,
          oldUid,
          attendeeUserId: oldBracelet.attendeeUserId,
        };
      });

      res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      const status = msg.includes("not found") ? 404 : msg.includes("must be blocked") || msg.includes("already linked") ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }
);

export default router;

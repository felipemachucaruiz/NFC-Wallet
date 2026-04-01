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

export default router;

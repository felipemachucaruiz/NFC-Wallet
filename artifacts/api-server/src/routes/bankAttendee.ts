import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  braceletsTable,
  attendeeRefundRequestsTable,
  eventsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { notifyRefundRequestApproved, notifyRefundRequestRejected } from "../lib/pushNotifications";

const router: IRouter = Router();

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
 * List all attendee refund requests (for Bank staff).
 * Pending requests include liveAmount from the bracelet's current balance
 * so staff always see the current value before approving, not the stale snapshot.
 */
router.get(
  "/bank/attendee-refund-requests",
  requireRole("bank", "admin", "event_admin"),
  async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: attendeeRefundRequestsTable.id,
        attendeeUserId: attendeeRefundRequestsTable.attendeeUserId,
        braceletUid: attendeeRefundRequestsTable.braceletUid,
        eventId: attendeeRefundRequestsTable.eventId,
        amount: attendeeRefundRequestsTable.amount,
        refundMethod: attendeeRefundRequestsTable.refundMethod,
        accountDetails: attendeeRefundRequestsTable.accountDetails,
        notes: attendeeRefundRequestsTable.notes,
        status: attendeeRefundRequestsTable.status,
        chipZeroed: attendeeRefundRequestsTable.chipZeroed,
        processedByUserId: attendeeRefundRequestsTable.processedByUserId,
        processedAt: attendeeRefundRequestsTable.processedAt,
        createdAt: attendeeRefundRequestsTable.createdAt,
        updatedAt: attendeeRefundRequestsTable.updatedAt,
        liveAmount: braceletsTable.lastKnownBalance,
      })
      .from(attendeeRefundRequestsTable)
      .leftJoin(braceletsTable, eq(braceletsTable.nfcUid, attendeeRefundRequestsTable.braceletUid))
      .orderBy(desc(attendeeRefundRequestsTable.createdAt));

    res.json({ requests: rows });
  }
);

/**
 * POST /bank/attendee-refund-requests/:id/process
 * Approve or reject an attendee refund request (Bank staff).
 * Uses a DB transaction with row-level locks to prevent concurrent double-refunds
 * and to ensure the approved amount reflects the live bracelet balance.
 */
router.post(
  "/bank/attendee-refund-requests/:id/process",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
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

    try {
      const updated = await db.transaction(async (tx) => {
        // Lock the request row first — prevents two staff members from
        // processing the same request simultaneously
        const [request] = await tx
          .select()
          .from(attendeeRefundRequestsTable)
          .where(eq(attendeeRefundRequestsTable.id, id))
          .for("update");

        if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
        if (request.status !== "pending") throw Object.assign(new Error("ALREADY_PROCESSED"), { status: 409 });

        // Lock the bracelet row and read live balance — prevents concurrent
        // manual refunds from both zeroing the same balance
        const [bracelet] = await tx
          .select({ lastKnownBalance: braceletsTable.lastKnownBalance })
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, request.braceletUid))
          .for("update");

        if (!bracelet) throw Object.assign(new Error("Bracelet not found"), { status: 404 });

        const liveAmount = bracelet.lastKnownBalance;

        // If approving but the bracelet already has no balance, a concurrent
        // refund already went through — return conflict so this attempt loses
        if (parsed.data.status === "approved" && liveAmount <= 0) {
          throw Object.assign(new Error("BALANCE_ALREADY_REFUNDED"), { status: 409 });
        }

        // Only update amount on approval — rejection keeps the original
        // snapshot amount for audit clarity; the bracelet balance isn't touched.
        const [result] = await tx
          .update(attendeeRefundRequestsTable)
          .set({
            status: parsed.data.status,
            ...(parsed.data.status === "approved" ? { amount: liveAmount } : {}),
            processedByUserId: userId,
            processedAt: new Date(),
            notes: parsed.data.notes ?? request.notes,
            updatedAt: new Date(),
          })
          .where(eq(attendeeRefundRequestsTable.id, id))
          .returning();

        if (parsed.data.status === "approved") {
          await tx
            .update(braceletsTable)
            .set({ lastKnownBalance: 0, updatedAt: new Date() })
            .where(eq(braceletsTable.nfcUid, request.braceletUid));
        }

        return result;
      });

      const [refundEvent] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, updated.eventId)).limit(1);
      if (updated.status === "approved") {
        void notifyRefundRequestApproved({
          attendeeUserId: updated.attendeeUserId,
          amount: updated.amount,
          currencyCode: refundEvent?.currencyCode,
        });
      } else if (updated.status === "rejected") {
        void notifyRefundRequestRejected({
          attendeeUserId: updated.attendeeUserId,
          amount: updated.amount,
          currencyCode: refundEvent?.currencyCode,
        });
      }

      res.json({ request: updated });
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      const status = err.status ?? 500;
      const message = err.message ?? "";
      if (message === "ALREADY_PROCESSED") {
        res.status(409).json({ error: "Request has already been processed" });
      } else if (message === "BALANCE_ALREADY_REFUNDED") {
        res.status(409).json({ error: "Balance has already been refunded by a concurrent operation" });
      } else if (message === "Request not found") {
        res.status(404).json({ error: "Refund request not found" });
      } else if (message === "Bracelet not found") {
        res.status(404).json({ error: "Bracelet not found" });
      } else {
        // Do not surface internal error messages to clients
        res.status(status >= 400 && status < 600 ? status : 500).json({ error: "Processing failed" });
      }
    }
  }
);

/**
 * POST /bank/attendee-refund-requests/:id/confirm-chip-zero
 * Mark the chip as zeroed after a successful NFC write-back (Bank staff).
 * Called by the bank portal after writing balance=0 to the physical bracelet.
 */
router.post(
  "/bank/attendee-refund-requests/:id/confirm-chip-zero",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const [request] = await db
      .select({ id: attendeeRefundRequestsTable.id, status: attendeeRefundRequestsTable.status })
      .from(attendeeRefundRequestsTable)
      .where(eq(attendeeRefundRequestsTable.id, id));

    if (!request) {
      res.status(404).json({ error: "Refund request not found" });
      return;
    }
    if (request.status !== "approved") {
      res.status(409).json({ error: "Only approved requests can have their chip zeroed" });
      return;
    }

    const [updated] = await db
      .update(attendeeRefundRequestsTable)
      .set({ chipZeroed: true, updatedAt: new Date() })
      .where(eq(attendeeRefundRequestsTable.id, id))
      .returning();

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

        const transferAmount = oldBracelet.lastKnownBalance;

        await tx
          .update(braceletsTable)
          .set({ lastKnownBalance: 0, updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, oldUid));

        await tx
          .update(braceletsTable)
          .set({
            lastKnownBalance: newBracelet.lastKnownBalance + transferAmount,
            attendeeUserId: oldBracelet.attendeeUserId,
            attendeeName: oldBracelet.attendeeName,
            phone: oldBracelet.phone,
            email: oldBracelet.email,
            eventId: oldBracelet.eventId,
            updatedAt: new Date(),
          })
          .where(eq(braceletsTable.nfcUid, newUid));

        return { transferredAmount: transferAmount, newUid, oldUid };
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

        const transferAmount = oldBracelet.lastKnownBalance;

        await tx
          .update(braceletsTable)
          .set({ lastKnownBalance: 0, updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, oldUid));

        await tx
          .update(braceletsTable)
          .set({
            lastKnownBalance: newBracelet.lastKnownBalance + transferAmount,
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
          transferredAmount: transferAmount,
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

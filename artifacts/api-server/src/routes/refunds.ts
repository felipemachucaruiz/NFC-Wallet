import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, refundsTable, attendeeRefundRequestsTable, usersTable } from "@workspace/db";
import { eq, and, gt, gte, lte, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { notifyRefundRequestApproved, notifyRefundRequestRejected } from "../lib/pushNotifications";
import { initiateWompiDisbursement, type DisbursementTarget } from "../lib/wompiDisbursement";

const router: IRouter = Router();

const refundMethods = ["cash", "nequi", "bancolombia", "other"] as const;

const createRefundSchema = z.object({
  braceletUid: z.string().min(1),
  refundMethod: z.enum(refundMethods),
  notes: z.string().optional(),
  newCounter: z.number().int().optional(),
  newBalanceCop: z.number().int().optional(),
});

router.post(
  "/refunds",
  requireRole("bank", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = createRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { braceletUid, refundMethod, notes, newCounter } = parsed.data;

    try {
      // All validation and writes happen inside the transaction so that
      // SELECT ... FOR UPDATE prevents two concurrent refunds from both
      // seeing a positive balance and both going through.
      const { refund, amountCop } = await db.transaction(async (tx) => {
        const [bracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, braceletUid))
          .for("update");

        if (!bracelet)
          throw Object.assign(new Error("Bracelet not found"), { httpStatus: 404 });
        if (bracelet.lastKnownBalanceCop <= 0)
          throw Object.assign(new Error("BALANCE_ALREADY_REFUNDED"), { httpStatus: 409 });
        if (newCounter !== undefined && newCounter <= (bracelet.lastCounter ?? 0))
          throw Object.assign(new Error("Invalid counter: must be greater than current counter"), { httpStatus: 400 });
        if (!bracelet.eventId)
          throw Object.assign(new Error("Bracelet is not associated with an event"), { httpStatus: 400 });

        const liveAmountCop = bracelet.lastKnownBalanceCop;

        const [newRefund] = await tx
          .insert(refundsTable)
          .values({
            braceletUid,
            eventId: bracelet.eventId,
            amountCop: liveAmountCop,
            refundMethod,
            notes,
            performedByUserId: req.user.id,
          })
          .returning();

        const braceletUpdate: Record<string, unknown> = {
          lastKnownBalanceCop: 0,
          updatedAt: new Date(),
        };
        if (newCounter !== undefined) {
          braceletUpdate.lastCounter = newCounter;
        }
        await tx
          .update(braceletsTable)
          .set(braceletUpdate)
          .where(eq(braceletsTable.nfcUid, braceletUid));

        return { refund: newRefund, amountCop: liveAmountCop };
      });

      res.status(201).json({ refund, amountCop });
    } catch (e: unknown) {
      const err = e as { message?: string; httpStatus?: number };
      const status = err.httpStatus ?? 500;
      const message = err.message ?? "";
      // Only surface known, safe domain errors to the client
      const knownErrors = new Set([
        "Bracelet not found",
        "BALANCE_ALREADY_REFUNDED",
        "Invalid counter: must be greater than current counter",
        "Bracelet is not associated with an event",
      ]);
      if (knownErrors.has(message)) {
        res.status(status).json({ error: message === "BALANCE_ALREADY_REFUNDED"
          ? "Balance has already been refunded by a concurrent operation"
          : message });
      } else {
        res.status(status >= 400 && status < 600 ? status : 500).json({ error: "Refund failed" });
      }
    }
  },
);

router.get(
  "/events/:eventId/unclaimed-balances",
  requireRole("event_admin", "admin"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = req.params;

    if (req.user.role === "event_admin" && req.user.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: cannot access another event's data" });
      return;
    }

    const bracelets = await db
      .select()
      .from(braceletsTable)
      .where(
        and(
          eq(braceletsTable.eventId, eventId),
          gt(braceletsTable.lastKnownBalanceCop, 0),
        ),
      );

    const refunds = await db
      .select()
      .from(refundsTable)
      .where(eq(refundsTable.eventId, eventId))
      .orderBy(desc(refundsTable.createdAt));

    const latestRefundByUid: Record<string, typeof refunds[0]> = {};
    for (const r of refunds) {
      if (!latestRefundByUid[r.braceletUid]) {
        latestRefundByUid[r.braceletUid] = r;
      }
    }

    const result = bracelets.map((b) => ({
      ...b,
      latestRefund: latestRefundByUid[b.nfcUid] ?? null,
    }));

    const totalUnclaimedCop = result.reduce((s, b) => s + b.lastKnownBalanceCop, 0);

    res.json({ bracelets: result, totalUnclaimedCop });
  },
);

router.get(
  "/reports/refunds",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, from, to } = req.query as { eventId?: string; from?: string; to?: string };
    const user = req.user!;

    const conditions = [];

    if (user.role === "event_admin") {
      if (!user.eventId) {
        res.json({ totalRefundedCop: 0, count: 0, byRefundMethod: {} });
        return;
      }
      conditions.push(eq(refundsTable.eventId, user.eventId));
    } else {
      if (eventId) conditions.push(eq(refundsTable.eventId, eventId));
    }

    if (from) conditions.push(gte(refundsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(refundsTable.createdAt, new Date(to)));

    const refunds = await db
      .select()
      .from(refundsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalRefundedCop = refunds.reduce((s, r) => s + r.amountCop, 0);
    const count = refunds.length;
    const byRefundMethod: Record<string, { totalCop: number; count: number }> = {};

    for (const r of refunds) {
      if (!byRefundMethod[r.refundMethod]) {
        byRefundMethod[r.refundMethod] = { totalCop: 0, count: 0 };
      }
      byRefundMethod[r.refundMethod].totalCop += r.amountCop;
      byRefundMethod[r.refundMethod].count += 1;
    }

    res.json({ totalRefundedCop, count, byRefundMethod });
  },
);

/**
 * GET /events/:eventId/refund-requests
 * List attendee refund requests for an event. Filterable by status.
 * Accessible by admin and event_admin.
 */
router.get(
  "/events/:eventId/refund-requests",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };
    const { status } = req.query as { status?: string };

    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: cannot access another event's data" });
      return;
    }

    const validStatuses = ["pending", "approved", "rejected", "disbursement_pending", "disbursement_completed", "disbursement_failed"];
    const conditions = [eq(attendeeRefundRequestsTable.eventId, eventId)];
    if (status && validStatuses.includes(status)) {
      conditions.push(eq(attendeeRefundRequestsTable.status, status as "pending" | "approved" | "rejected" | "disbursement_pending" | "disbursement_completed" | "disbursement_failed"));
    }

    const requests = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(attendeeRefundRequestsTable.createdAt));

    res.json({ refundRequests: requests });
  },
);

/**
 * POST /refund-requests/:id/approve
 * Approve a pending attendee refund request. Atomically deducts the amount from the bracelet balance.
 * For non-cash refund methods (nequi), automatically initiates a Wompi disbursement.
 */
router.post(
  "/refund-requests/:id/approve",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    try {
      const result = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(attendeeRefundRequestsTable)
          .where(eq(attendeeRefundRequestsTable.id, id))
          .for("update");

        if (!request) throw Object.assign(new Error("Refund request not found"), { httpStatus: 404 });
        if (request.status !== "pending") throw Object.assign(new Error("Request is not pending"), { httpStatus: 409 });

        if (req.user!.role === "event_admin" && req.user!.eventId !== request.eventId) {
          throw Object.assign(new Error("Forbidden: cannot access another event's data"), { httpStatus: 403 });
        }

        // Atomically deduct bracelet balance
        const [bracelet] = await tx
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, request.braceletUid))
          .for("update");

        if (!bracelet) throw Object.assign(new Error("Bracelet not found"), { httpStatus: 404 });

        const newBalance = Math.max(0, bracelet.lastKnownBalanceCop - request.amountCop);

        await tx
          .update(braceletsTable)
          .set({ lastKnownBalanceCop: newBalance, updatedAt: new Date() })
          .where(eq(braceletsTable.nfcUid, request.braceletUid));

        const [updated] = await tx
          .update(attendeeRefundRequestsTable)
          .set({
            status: "approved",
            processedByUserId: req.user!.id,
            processedAt: new Date(),
          })
          .where(eq(attendeeRefundRequestsTable.id, id))
          .returning();

        return updated;
      });

      // Always send push notification to the attendee
      void notifyRefundRequestApproved({
        attendeeUserId: result.attendeeUserId,
        amountCop: result.amountCop,
      });

      // For cash refunds, no disbursement needed — manual collection.
      if (result.refundMethod === "cash" || result.refundMethod === "other") {
        res.json({ refundRequest: result });
        return;
      }

      // Attempt automatic Wompi disbursement for nequi/bancolombia
      const refundMethod = result.refundMethod as "nequi" | "bancolombia";
      const isSupportedForDisbursement = refundMethod === "nequi";

      if (!isSupportedForDisbursement) {
        // bancolombia and other methods not yet supported for automated disbursement
        res.json({ refundRequest: result });
        return;
      }

      // Fetch attendee account details for disbursement
      const [attendeeUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, result.attendeeUserId));

      // Parse phone number from accountDetails (stored as JSON or plain string)
      let phoneNumber: string | undefined;
      if (result.accountDetails) {
        try {
          const parsed = JSON.parse(result.accountDetails) as { phoneNumber?: string; phone?: string };
          phoneNumber = parsed.phoneNumber || parsed.phone;
        } catch {
          // accountDetails stored as plain phone number string
          phoneNumber = result.accountDetails.trim();
        }
      }

      if (!phoneNumber) {
        // No account details — mark as failed with clear message
        const [updated] = await db
          .update(attendeeRefundRequestsTable)
          .set({
            status: "disbursement_failed",
            disbursementError: "No Nequi phone number on file. Manual transfer required.",
          })
          .where(eq(attendeeRefundRequestsTable.id, id))
          .returning();
        res.json({
          refundRequest: updated,
          disbursementError: "No Nequi phone number on file. Manual transfer required.",
        });
        return;
      }

      const target: DisbursementTarget = {
        method: refundMethod,
        phoneNumber,
      };

      const customerEmail = attendeeUser?.email || `attendee_${result.attendeeUserId}@evento.local`;

      // Mark as disbursement_pending before firing the API call
      await db
        .update(attendeeRefundRequestsTable)
        .set({ status: "disbursement_pending" })
        .where(eq(attendeeRefundRequestsTable.id, id));

      const outcome = await initiateWompiDisbursement(
        result.id,
        result.amountCop,
        target,
        customerEmail,
      );

      if (outcome.success) {
        const [updated] = await db
          .update(attendeeRefundRequestsTable)
          .set({
            status: "disbursement_pending",
            disbursementReference: outcome.reference,
            disbursementWompiId: outcome.wompiId,
            disbursementError: null,
          })
          .where(eq(attendeeRefundRequestsTable.id, id))
          .returning();
        res.json({ refundRequest: updated });
      } else {
        const [updated] = await db
          .update(attendeeRefundRequestsTable)
          .set({
            status: "disbursement_failed",
            disbursementError: outcome.error,
          })
          .where(eq(attendeeRefundRequestsTable.id, id))
          .returning();
        res.json({
          refundRequest: updated,
          disbursementError: outcome.error,
        });
      }
    } catch (e: unknown) {
      const err = e as { message?: string; httpStatus?: number };
      const status = err.httpStatus ?? 500;
      const knownErrors = new Set(["Refund request not found", "Request is not pending", "Bracelet not found", "Forbidden: cannot access another event's data"]);
      if (knownErrors.has(err.message ?? "")) {
        res.status(status).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Failed to approve refund request" });
      }
    }
  },
);

/**
 * POST /refund-requests/:id/reject
 * Reject a pending attendee refund request with an optional reason.
 */
router.post(
  "/refund-requests/:id/reject",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ reason: z.string().min(1).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [request] = await db
      .select()
      .from(attendeeRefundRequestsTable)
      .where(eq(attendeeRefundRequestsTable.id, id));

    if (!request) {
      res.status(404).json({ error: "Refund request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(409).json({ error: "Request is not pending" });
      return;
    }

    if (req.user!.role === "event_admin" && req.user!.eventId !== request.eventId) {
      res.status(403).json({ error: "Forbidden: cannot access another event's data" });
      return;
    }

    const [updated] = await db
      .update(attendeeRefundRequestsTable)
      .set({
        status: "rejected",
        notes: parsed.data.reason ? `${request.notes ? request.notes + " | " : ""}Rejected: ${parsed.data.reason}` : request.notes,
        processedByUserId: req.user!.id,
        processedAt: new Date(),
      })
      .where(eq(attendeeRefundRequestsTable.id, id))
      .returning();

    void notifyRefundRequestRejected({
      attendeeUserId: request.attendeeUserId,
      amountCop: request.amountCop,
    });

    res.json({ refundRequest: updated });
  },
);

/**
 * POST /payments/disbursement-webhook
 * Wompi webhook for disbursement (transaction) status updates.
 * Updates the refund request status based on the transaction outcome.
 */
router.post(
  "/payments/disbursement-webhook",
  async (req: Request, res: Response) => {
    const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";
    if (!WOMPI_EVENTS_SECRET) {
      console.error("WOMPI_EVENTS_SECRET not configured — rejecting disbursement webhook");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    const signature = req.headers["x-event-checksum"] as string | undefined;
    if (!signature) {
      res.status(400).json({ error: "Missing webhook signature" });
      return;
    }

    const body = req.body as {
      event: string;
      data: { transaction?: { id: string; status: string; reference: string; amount_in_cents: number } };
      sent_at: string;
      timestamp: number;
      environment: string;
    };

    const txData = body.data?.transaction;
    const properties = txData
      ? `${txData.id}${txData.status}${txData.amount_in_cents}`
      : "";

    const crypto = await import("crypto");
    const checksumInput = `${properties}${body.timestamp}${WOMPI_EVENTS_SECRET}`;
    const checksum = crypto
      .createHash("sha256")
      .update(checksumInput)
      .digest("hex");

    try {
      const checksumBuf = Buffer.from(checksum, "hex");
      const signatureBuf = Buffer.from(signature, "hex");
      if (checksumBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(checksumBuf, signatureBuf)) {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Invalid webhook signature format" });
      return;
    }

    const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
    const rawTimestamp = body.timestamp;
    if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
      res.status(400).json({ error: "Webhook timestamp is invalid" });
      return;
    }
    const webhookTimestampMs = rawTimestamp * 1000;
    if (Math.abs(Date.now() - webhookTimestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
      res.status(400).json({ error: "Webhook timestamp is stale" });
      return;
    }

    if (body.environment === "test" && process.env.NODE_ENV === "production") {
      res.status(400).json({ error: "Test webhooks are not accepted in production" });
      return;
    }

    if (body.event === "transaction.updated" && txData) {
      const [refundRequest] = await db
        .select()
        .from(attendeeRefundRequestsTable)
        .where(eq(attendeeRefundRequestsTable.disbursementWompiId, txData.id));

      if (refundRequest) {
        if (txData.status === "APPROVED") {
          await db
            .update(attendeeRefundRequestsTable)
            .set({ status: "disbursement_completed" })
            .where(eq(attendeeRefundRequestsTable.id, refundRequest.id));
        } else if (txData.status === "DECLINED" || txData.status === "ERROR" || txData.status === "VOIDED") {
          await db
            .update(attendeeRefundRequestsTable)
            .set({
              status: "disbursement_failed",
              disbursementError: `Wompi transaction ${txData.status.toLowerCase()}. Manual transfer required.`,
            })
            .where(eq(attendeeRefundRequestsTable.id, refundRequest.id));
        }
      }
    }

    res.json({ success: true });
  },
);

export default router;

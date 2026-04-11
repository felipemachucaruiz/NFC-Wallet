import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, ticketsTable, ticketCheckInsTable, eventDaysTable, ticketTypesTable, ticketOrdersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireTicketingEnabled } from "../middlewares/featureGating";
import { z } from "zod";

function getTicketQrSecret(): string {
  const secret = process.env.TICKET_QR_SECRET || process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error("TICKET_QR_SECRET or HMAC_SECRET environment variable is required for ticket QR code verification");
  }
  return secret;
}

export function verifyTicketQrToken(token: string): { ticketId: string; attendeeUserId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getTicketQrSecret())
    .update(data)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.tid) return null;
    return { ticketId: payload.tid, attendeeUserId: payload.uid || "" };
  } catch {
    return null;
  }
}

const router: IRouter = Router();

const checkInSchema = z.object({
  qrToken: z.string().min(1),
  braceletUid: z.string().optional(),
});

router.post(
  "/events/:eventId/check-in",
  requireRole("gate", "event_admin", "admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (req.user!.role === "gate" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: gate staff can only check in at their assigned event" });
      return;
    }
    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: not authorized for this event" });
      return;
    }

    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { qrToken, braceletUid } = parsed.data;

    const tokenData = verifyTicketQrToken(qrToken);
    if (!tokenData) {
      res.status(400).json({ error: "INVALID_QR", message: "Invalid or tampered QR code" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(and(eq(ticketsTable.id, tokenData.ticketId), eq(ticketsTable.eventId, eventId)));

    if (!ticket) {
      res.status(404).json({ error: "TICKET_NOT_FOUND", message: "Ticket not found for this event" });
      return;
    }

    if (ticket.status === "cancelled") {
      res.status(400).json({ error: "TICKET_CANCELLED", message: "This ticket has been cancelled" });
      return;
    }

    if (ticket.status === "used") {
      res.status(400).json({ error: "TICKET_USED", message: "This ticket has already been fully used" });
      return;
    }

    const [order] = await db
      .select({ paymentStatus: ticketOrdersTable.paymentStatus })
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.id, ticket.orderId));
    if (!order || order.paymentStatus !== "confirmed") {
      res.status(400).json({ error: "PAYMENT_NOT_CONFIRMED", message: "Ticket order payment has not been confirmed" });
      return;
    }

    const [ticketType] = ticket.ticketTypeId
      ? await db
          .select({ validEventDayIds: ticketTypesTable.validEventDayIds })
          .from(ticketTypesTable)
          .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
      : [undefined];

    const today = new Date().toISOString().split("T")[0];

    const allDays = await db
      .select()
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, eventId));

    const todayDay = allDays.find((d) => d.date === today);

    if (!todayDay) {
      res.status(400).json({ error: "NO_EVENT_TODAY", message: "No event day scheduled for today" });
      return;
    }

    const validDayIds = (ticketType?.validEventDayIds as string[]) ?? [];
    if (validDayIds.length > 0 && !validDayIds.includes(todayDay.id)) {
      res.status(400).json({ error: "TICKET_NOT_VALID_TODAY", message: "This ticket is not valid for today's event day" });
      return;
    }

    const [existingCheckIn] = await db
      .select({ id: ticketCheckInsTable.id })
      .from(ticketCheckInsTable)
      .where(and(
        eq(ticketCheckInsTable.ticketId, ticket.id),
        eq(ticketCheckInsTable.eventDayId, todayDay.id),
      ));

    if (existingCheckIn) {
      res.status(409).json({ error: "ALREADY_CHECKED_IN", message: "This ticket has already been checked in today" });
      return;
    }

    try {
      const [checkIn] = await db
        .insert(ticketCheckInsTable)
        .values({
          ticketId: ticket.id,
          eventDayId: todayDay.id,
          braceletUid: braceletUid ?? null,
        })
        .returning();

      res.status(201).json({
        success: true,
        checkIn: {
          id: checkIn.id,
          ticketId: checkIn.ticketId,
          eventDayId: checkIn.eventDayId,
          checkedInAt: checkIn.checkedInAt,
        },
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "ALREADY_CHECKED_IN", message: "This ticket has already been checked in today" });
        return;
      }
      throw err;
    }
  },
);

router.post(
  "/events/:eventId/check-in/validate",
  requireRole("gate", "event_admin", "admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (req.user!.role === "gate" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: gate staff can only validate at their assigned event" });
      return;
    }
    if (req.user!.role === "event_admin" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden: not authorized for this event" });
      return;
    }

    const parsed = z.object({ qrToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const tokenData = verifyTicketQrToken(parsed.data.qrToken);
    if (!tokenData) {
      res.status(400).json({ error: "INVALID_QR", message: "Invalid or tampered QR code" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(and(eq(ticketsTable.id, tokenData.ticketId), eq(ticketsTable.eventId, eventId)));

    if (!ticket) {
      res.status(404).json({ error: "TICKET_NOT_FOUND", message: "Ticket not found for this event" });
      return;
    }

    const [ticketType] = ticket.ticketTypeId
      ? await db
          .select()
          .from(ticketTypesTable)
          .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
      : [undefined];

    const checkIns = await db
      .select()
      .from(ticketCheckInsTable)
      .where(eq(ticketCheckInsTable.ticketId, ticket.id));

    res.json({
      ticket: {
        id: ticket.id,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        status: ticket.status,
        eventId: ticket.eventId,
      },
      ticketType: ticketType ? {
        id: ticketType.id,
        name: ticketType.name,
        validEventDayIds: ticketType.validEventDayIds,
      } : null,
      checkIns: checkIns.map((c) => ({
        id: c.id,
        eventDayId: c.eventDayId,
        checkedInAt: c.checkedInAt,
      })),
    });
  },
);

export default router;

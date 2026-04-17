import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, eventsTable, ticketTypesTable, ticketOrdersTable, ticketsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { requireTicketingEnabled } from "../middlewares/featureGating";
import { z } from "zod";

const router: IRouter = Router();

function generateTicketQrToken(ticketId: string, attendeeUserId: string | null): string {
  const secret = process.env.TICKET_QR_SECRET || process.env.HMAC_SECRET;
  if (!secret) throw new Error("TICKET_QR_SECRET or HMAC_SECRET env var required");
  const payload = {
    tid: ticketId,
    uid: attendeeUserId || "",
    iat: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

const saleSchema = z.object({
  ticketTypeId: z.string().min(1),
  attendeeName: z.string().min(1).max(255),
  attendeeEmail: z.string().email(),
  attendeePhone: z.string().max(30).optional(),
  paymentMethod: z.enum(["gate_cash", "gate_transfer", "free"]).default("gate_cash"),
});

router.get(
  "/events/:eventId/box-office/ticket-types",
  requireRole("box_office", "event_admin", "admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (req.user!.role === "box_office" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied to this event" });
      return;
    }

    const ticketTypes = await db
      .select({
        id: ticketTypesTable.id,
        name: ticketTypesTable.name,
        price: ticketTypesTable.price,
        quantity: ticketTypesTable.quantity,
        soldCount: ticketTypesTable.soldCount,
        isActive: ticketTypesTable.isActive,
      })
      .from(ticketTypesTable)
      .where(and(
        eq(ticketTypesTable.eventId, eventId),
        eq(ticketTypesTable.isActive, true),
      ));

    res.json({ ticketTypes });
  },
);

router.post(
  "/events/:eventId/box-office/sale",
  requireRole("box_office", "event_admin", "admin"),
  requireTicketingEnabled((req) => req.params.eventId as string),
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    if (req.user!.role === "box_office" && req.user!.eventId !== eventId) {
      res.status(403).json({ error: "Access denied to this event" });
      return;
    }

    const parsed = saleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { ticketTypeId, attendeeName, attendeeEmail, attendeePhone, paymentMethod } = parsed.data;

    const [event] = await db.select({ salesChannel: eventsTable.salesChannel }).from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.salesChannel === "online") {
      res.status(400).json({ error: "This event does not allow door sales" });
      return;
    }

    const [ticketType] = await db
      .select()
      .from(ticketTypesTable)
      .where(and(
        eq(ticketTypesTable.id, ticketTypeId),
        eq(ticketTypesTable.eventId, eventId),
        eq(ticketTypesTable.isActive, true),
      ));

    if (!ticketType) {
      res.status(404).json({ error: "Ticket type not found or inactive" });
      return;
    }

    const available = ticketType.quantity - ticketType.soldCount;
    if (available < 1) {
      res.status(409).json({ error: `Tickets for ${ticketType.name} are sold out` });
      return;
    }

    const normalizedEmail = attendeeEmail.toLowerCase().trim();
    const totalAmount = Number(ticketType.price);

    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(ticketTypesTable)
        .set({ soldCount: sql`${ticketTypesTable.soldCount} + 1`, updatedAt: new Date() })
        .where(and(
          eq(ticketTypesTable.id, ticketTypeId),
          sql`${ticketTypesTable.quantity} - ${ticketTypesTable.soldCount} >= 1`,
        ))
        .returning({ id: ticketTypesTable.id });

      if (updated.length === 0) throw new Error("SOLD_OUT");

      const [order] = await tx
        .insert(ticketOrdersTable)
        .values({
          eventId,
          buyerUserId: req.user!.id,
          buyerEmail: normalizedEmail,
          buyerName: attendeeName,
          totalAmount,
          ticketCount: 1,
          paymentStatus: "confirmed",
          paymentMethod,
          attendeesJson: [{ name: attendeeName, email: normalizedEmail, phone: attendeePhone, ticketTypeId }] as unknown as Record<string, unknown>[],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        })
        .returning();

      const [ticket] = await tx
        .insert(ticketsTable)
        .values({
          orderId: order.id,
          ticketTypeId,
          eventId,
          attendeeName,
          attendeeEmail: normalizedEmail,
          attendeePhone: attendeePhone ?? null,
          attendeeUserId: null,
          status: "valid",
        })
        .returning();

      const qrCodeToken = generateTicketQrToken(ticket.id, null);
      await tx.update(ticketsTable).set({ qrCodeToken, updatedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));

      return { order, ticket: { ...ticket, qrCodeToken } };
    }).catch((err) => {
      if (err.message === "SOLD_OUT") {
        res.status(409).json({ error: `Tickets for ${ticketType.name} are sold out` });
        return null;
      }
      throw err;
    });

    if (!result) return;

    res.status(201).json({
      orderId: result.order.id,
      ticket: {
        id: result.ticket.id,
        qrCodeToken: result.ticket.qrCodeToken,
        attendeeName: result.ticket.attendeeName,
        attendeeEmail: result.ticket.attendeeEmail,
        ticketTypeName: ticketType.name,
        totalAmount,
        paymentMethod,
      },
    });
  },
);

export default router;

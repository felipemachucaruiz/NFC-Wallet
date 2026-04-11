import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, ticketsTable, ticketOrdersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { sendWhatsAppText, isWhatsAppConfigured } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post(
  "/notifications/event-reminder",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const { eventId, message: customMessage } = req.body as { eventId: string; message?: string };

    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    if (!isWhatsAppConfigured()) {
      res.status(503).json({ error: "WhatsApp is not configured" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (req.user?.role === "event_admin" && req.user?.eventId !== eventId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const confirmedOrders = await db.select({ id: ticketOrdersTable.id })
      .from(ticketOrdersTable)
      .where(and(eq(ticketOrdersTable.eventId, eventId), eq(ticketOrdersTable.paymentStatus, "confirmed")));

    const orderIds = confirmedOrders.map((o) => o.id);
    if (orderIds.length === 0) {
      res.json({ sent: 0, failed: 0, total: 0 });
      return;
    }

    const allTickets = await db.select({
      attendeeName: ticketsTable.attendeeName,
      attendeePhone: ticketsTable.attendeePhone,
    }).from(ticketsTable)
      .where(inArray(ticketsTable.orderId, orderIds));

    const uniquePhones = new Map<string, string>();
    for (const t of allTickets) {
      if (t.attendeePhone) {
        const phone = t.attendeePhone.replace(/[\s\-\(\)]/g, "");
        if (!uniquePhones.has(phone)) {
          uniquePhones.set(phone, t.attendeeName);
        }
      }
    }

    const text = customMessage || [
      `📢 *Recordatorio: ${event.name}*`,
      ``,
      `Hola, te recordamos que el evento *${event.name}* es pronto.`,
      event.venueAddress ? `📍 *Dirección:* ${event.venueAddress}` : "",
      ``,
      `No olvides llevar tu código QR (revisa tu correo o la app de Tapee).`,
      ``,
      `¡Te esperamos! 🎉`,
      `— Tapee`,
    ].filter(Boolean).join("\n");

    let sent = 0;
    let failed = 0;

    for (const [phone] of uniquePhones) {
      try {
        const ok = await sendWhatsAppText(phone, text);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }

    logger.info({ eventId, sent, failed, total: uniquePhones.size }, "Event reminder WhatsApp sent");
    res.json({ sent, failed, total: uniquePhones.size });
  },
);

router.post(
  "/notifications/send-whatsapp",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { phone, message } = req.body as { phone: string; message: string };

    if (!phone || !message) {
      res.status(400).json({ error: "phone and message are required" });
      return;
    }

    if (!isWhatsAppConfigured()) {
      res.status(503).json({ error: "WhatsApp is not configured" });
      return;
    }

    const ok = await sendWhatsAppText(phone, message);
    res.json({ success: ok });
  },
);

export default router;

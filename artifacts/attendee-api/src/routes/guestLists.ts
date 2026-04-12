import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, guestListsTable, guestListEntriesTable, ticketOrdersTable, ticketsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { generateTicketQrToken } from "../lib/ticketQr";
import { sendTicketConfirmationEmail } from "../lib/ticketEmails";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get(
  "/guest-list/:slug",
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;

    const [list] = await db
      .select({
        id: guestListsTable.id,
        name: guestListsTable.name,
        slug: guestListsTable.slug,
        maxGuests: guestListsTable.maxGuests,
        currentCount: guestListsTable.currentCount,
        isPublic: guestListsTable.isPublic,
        status: guestListsTable.status,
        expiresAt: guestListsTable.expiresAt,
        eventId: guestListsTable.eventId,
      })
      .from(guestListsTable)
      .where(eq(guestListsTable.slug, slug));

    if (!list) {
      res.status(404).json({ error: "Guest list not found" });
      return;
    }

    const [event] = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        coverImageUrl: eventsTable.coverImageUrl,
        venueAddress: eventsTable.venueAddress,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        currencyCode: eventsTable.currencyCode,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, list.eventId));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const spotsRemaining = list.maxGuests - list.currentCount;
    const isExpired = list.expiresAt ? new Date(list.expiresAt) < new Date() : false;
    const isAvailable = list.status === "active" && spotsRemaining > 0 && !isExpired;

    res.json({
      guestList: {
        id: list.id,
        name: list.name,
        spotsRemaining,
        maxGuests: list.maxGuests,
        currentCount: list.currentCount,
        status: list.status,
        isAvailable,
        expiresAt: list.expiresAt,
      },
      event: {
        id: event.id,
        name: event.name,
        coverImageUrl: event.coverImageUrl,
        venueAddress: event.venueAddress,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    });
  },
);

const signupSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(320),
  phone: z.string().max(30).optional(),
});

router.post(
  "/guest-list/:slug/signup",
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const { name, email, phone } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    try {
      const result = await db.transaction(async (tx) => {
        const [list] = await tx
          .select()
          .from(guestListsTable)
          .where(eq(guestListsTable.slug, slug))
          .for("update");

        if (!list) return { error: "Lista de invitados no encontrada", status: 404 } as const;

        if (list.status !== "active") return { error: "Esta lista de invitados está cerrada", status: 400 } as const;

        if (list.expiresAt && new Date(list.expiresAt) < new Date()) {
          return { error: "Esta lista de invitados ha expirado", status: 400 } as const;
        }

        if (list.currentCount >= list.maxGuests) {
          return { error: "Esta lista de invitados está llena", status: 400 } as const;
        }

        const existingEntries = await tx
          .select({ id: guestListEntriesTable.id })
          .from(guestListEntriesTable)
          .where(and(
            eq(guestListEntriesTable.guestListId, list.id),
            eq(guestListEntriesTable.email, normalizedEmail),
          ));

        if (existingEntries.length > 0) {
          return { error: "Este correo ya está registrado en esta lista", status: 409 } as const;
        }

        const [event] = await tx
          .select()
          .from(eventsTable)
          .where(eq(eventsTable.id, list.eventId));

        if (!event) return { error: "Event not found", status: 404 } as const;

        const [order] = await tx
          .insert(ticketOrdersTable)
          .values({
            eventId: list.eventId,
            buyerEmail: normalizedEmail,
            buyerName: name,
            totalAmount: 0,
            ticketCount: 1,
            paymentStatus: "confirmed",
            paymentMethod: "guest_list",
          })
          .returning();

        const ticketId = crypto.randomUUID();
        const qrToken = generateTicketQrToken(ticketId, null);

        const [ticket] = await tx
          .insert(ticketsTable)
          .values({
            id: ticketId,
            orderId: order.id,
            ticketTypeId: null,
            eventId: list.eventId,
            attendeeName: name,
            attendeeEmail: normalizedEmail,
            attendeePhone: phone || null,
            qrCodeToken: qrToken,
            status: "valid",
          })
          .returning();

        const [entry] = await tx
          .insert(guestListEntriesTable)
          .values({
            guestListId: list.id,
            name,
            email: normalizedEmail,
            phone: phone || null,
            ticketId: ticket.id,
            orderId: order.id,
          })
          .returning();

        await tx
          .update(guestListsTable)
          .set({ currentCount: sql`${guestListsTable.currentCount} + 1` })
          .where(eq(guestListsTable.id, list.id));

        return { success: true, entry, ticket: { id: ticket.id, qrCodeToken: qrToken }, event, order, listName: list.name } as const;
      });

      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      const locale = result.event.currencyCode === "USD" ? "en" : "es";

      void sendTicketConfirmationEmail({
        attendeeName: name,
        attendeeEmail: normalizedEmail,
        eventName: result.event.name,
        eventDates: [],
        eventStartsAt: result.event.startsAt ? new Date(result.event.startsAt).toISOString() : undefined,
        flyerImageUrl: result.event.flyerImageUrl ?? result.event.coverImageUrl ?? undefined,
        venueName: result.event.venueAddress ?? "",
        venueAddress: result.event.venueAddress ?? "",
        sectionName: "Guest List",
        ticketTypeName: result.listName,
        validDays: [],
        qrCodeToken: result.ticket.qrCodeToken,
        ticketId: result.ticket.id,
        orderId: result.order.id,
        locale,
        hasAccount: false,
        currencyCode: result.event.currencyCode ?? "COP",
      }).catch((err) => logger.error(`Failed to send guest list email to ${normalizedEmail}: ${err}`));

      res.status(201).json({
        success: true,
        entry: {
          id: result.entry.id,
          name: result.entry.name,
          email: result.entry.email,
        },
        ticket: {
          id: result.ticket.id,
          qrCodeToken: result.ticket.qrCodeToken,
        },
        event: {
          name: result.event.name,
          venueAddress: result.event.venueAddress,
          startsAt: result.event.startsAt,
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, errMsg }, "Guest list signup error");
      if (errMsg?.includes("unique") || errMsg?.includes("duplicate")) {
        res.status(409).json({ error: "Este correo ya está registrado en esta lista" });
        return;
      }
      if (errMsg?.includes("does not exist") || errMsg?.includes("no existe")) {
        res.status(500).json({ error: `Error de base de datos: tabla no encontrada. Contacta soporte.` });
        return;
      }
      res.status(500).json({ error: `Ocurrió un error al registrarse: ${errMsg}` });
    }
  },
);

export default router;

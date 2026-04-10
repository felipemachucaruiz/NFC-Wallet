import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, eventDaysTable, venuesTable, venueSectionsTable, ticketTypesTable, ticketOrdersTable, ticketsTable, wompiPaymentIntentsTable, usersTable } from "@workspace/db";
import { eq, and, sql, ilike, gte, lte, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get(
  "/public/events",
  async (req: Request, res: Response) => {
    const {
      search,
      category,
      city,
      dateFrom,
      dateTo,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || "20", 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      eq(eventsTable.active, true),
      eq(eventsTable.ticketingEnabled, true),
    ];

    if (search) {
      conditions.push(ilike(eventsTable.name, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(eventsTable.category, category));
    }
    if (dateFrom) {
      conditions.push(gte(eventsTable.startsAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(eventsTable.startsAt, new Date(dateTo)));
    }

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        coverImageUrl: eventsTable.coverImageUrl,
        category: eventsTable.category,
        tags: eventsTable.tags,
        minAge: eventsTable.minAge,
        venueAddress: eventsTable.venueAddress,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        latitude: eventsTable.latitude,
        longitude: eventsTable.longitude,
        salesChannel: eventsTable.salesChannel,
      })
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(asc(eventsTable.startsAt))
      .limit(limitNum)
      .offset(offset);

    const eventsWithPricing = await Promise.all(
      events.map(async (event) => {
        const priceRange = await db
          .select({
            minPrice: sql<number>`COALESCE(MIN(${ticketTypesTable.price}), 0)`,
            maxPrice: sql<number>`COALESCE(MAX(${ticketTypesTable.price}), 0)`,
          })
          .from(ticketTypesTable)
          .where(and(eq(ticketTypesTable.eventId, event.id), eq(ticketTypesTable.isActive, true)));

        const days = await db
          .select({ id: eventDaysTable.id, date: eventDaysTable.date, label: eventDaysTable.label })
          .from(eventDaysTable)
          .where(eq(eventDaysTable.eventId, event.id))
          .orderBy(asc(eventDaysTable.displayOrder));

        return {
          ...event,
          priceFrom: priceRange[0]?.minPrice ?? 0,
          priceTo: priceRange[0]?.maxPrice ?? 0,
          eventDays: days,
          dayCount: days.length,
        };
      }),
    );

    if (city) {
      const filteredEvents = [];
      for (const event of eventsWithPricing) {
        const [venue] = await db
          .select({ city: venuesTable.city })
          .from(venuesTable)
          .where(and(eq(venuesTable.eventId, event.id), ilike(venuesTable.city, `%${city}%`)))
          .limit(1);
        if (venue) filteredEvents.push(event);
        else if (event.venueAddress && event.venueAddress.toLowerCase().includes(city.toLowerCase())) {
          filteredEvents.push(event);
        }
      }
      res.json({ events: filteredEvents, page: pageNum, limit: limitNum });
      return;
    }

    res.json({ events: eventsWithPricing, page: pageNum, limit: limitNum });
  },
);

router.get(
  "/public/events/:eventId",
  async (req: Request, res: Response) => {
    const { eventId } = req.params as { eventId: string };

    const [event] = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        longDescription: eventsTable.longDescription,
        coverImageUrl: eventsTable.coverImageUrl,
        flyerImageUrl: eventsTable.flyerImageUrl,
        category: eventsTable.category,
        tags: eventsTable.tags,
        minAge: eventsTable.minAge,
        venueAddress: eventsTable.venueAddress,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        latitude: eventsTable.latitude,
        longitude: eventsTable.longitude,
        salesChannel: eventsTable.salesChannel,
        ticketingEnabled: eventsTable.ticketingEnabled,
        currencyCode: eventsTable.currencyCode,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.active, true)));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.ticketingEnabled) {
      res.status(404).json({ error: "Ticketing is not enabled for this event" });
      return;
    }

    const days = await db
      .select()
      .from(eventDaysTable)
      .where(eq(eventDaysTable.eventId, eventId))
      .orderBy(asc(eventDaysTable.displayOrder), asc(eventDaysTable.date));

    const venues = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.eventId, eventId));

    const sections = venues.length > 0
      ? await db
          .select()
          .from(venueSectionsTable)
          .where(eq(venueSectionsTable.venueId, venues[0].id))
          .orderBy(asc(venueSectionsTable.displayOrder))
      : [];

    const ticketTypes = event.ticketingEnabled
      ? await db
          .select({
            id: ticketTypesTable.id,
            name: ticketTypesTable.name,
            description: ticketTypesTable.description,
            price: ticketTypesTable.price,
            quantity: ticketTypesTable.quantity,
            soldCount: ticketTypesTable.soldCount,
            saleStart: ticketTypesTable.saleStart,
            saleEnd: ticketTypesTable.saleEnd,
            isActive: ticketTypesTable.isActive,
            validEventDayIds: ticketTypesTable.validEventDayIds,
            sectionId: ticketTypesTable.sectionId,
          })
          .from(ticketTypesTable)
          .where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.isActive, true)))
      : [];

    const availability = ticketTypes.map((tt) => ({
      ticketTypeId: tt.id,
      name: tt.name,
      price: tt.price,
      available: tt.quantity - tt.soldCount,
      total: tt.quantity,
      saleStart: tt.saleStart,
      saleEnd: tt.saleEnd,
      validEventDayIds: tt.validEventDayIds,
      sectionId: tt.sectionId,
    }));

    res.json({
      event,
      eventDays: days,
      venues,
      sections,
      ticketTypes: availability,
    });
  },
);

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";

async function fetchWompiAcceptanceToken(): Promise<string> {
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch Wompi acceptance token");
  const data = await res.json() as { data: { presigned_acceptance: { acceptance_token: string } } };
  return data.data.presigned_acceptance.acceptance_token;
}

const guestAttendeeSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  ticketTypeId: z.string().min(1),
});

const guestOrderSchema = z.object({
  eventId: z.string().min(1),
  buyerName: z.string().min(1).max(255),
  buyerEmail: z.string().email(),
  attendees: z.array(guestAttendeeSchema).min(1).max(20),
  paymentMethod: z.enum(["card", "nequi", "pse"]),
  cardToken: z.string().optional(),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
  userLegalIdType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  userLegalId: z.string().max(20).optional(),
  installments: z.number().int().min(1).max(36).optional(),
  redirectUrl: z.string().url().optional(),
});

router.post(
  "/public/events/:eventId/purchase",
  async (req: Request, res: Response) => {
    if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
      res.status(503).json({ error: "Payment gateway not configured" });
      return;
    }

    const parsed = guestOrderSchema.safeParse({ ...req.body, eventId: req.params.eventId });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const { eventId, buyerName, buyerEmail, attendees, paymentMethod, cardToken, phoneNumber, bankCode, userLegalIdType, userLegalId, installments, redirectUrl } = parsed.data;

    if (paymentMethod === "card" && !cardToken) {
      res.status(400).json({ error: "cardToken is required for card payments" });
      return;
    }
    if (paymentMethod === "nequi" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Nequi payments" });
      return;
    }
    if (paymentMethod === "pse" && (!bankCode || !userLegalId)) {
      res.status(400).json({ error: "bankCode and userLegalId are required for PSE payments" });
      return;
    }

    const [event] = await db
      .select({
        id: eventsTable.id,
        ticketingEnabled: eventsTable.ticketingEnabled,
        salesChannel: eventsTable.salesChannel,
        currencyCode: eventsTable.currencyCode,
        name: eventsTable.name,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.active, true)));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!event.ticketingEnabled) {
      res.status(404).json({ error: "Ticketing is not enabled for this event" });
      return;
    }
    if (event.salesChannel === "door") {
      res.status(400).json({ error: "Online ticket sales are not available for this event" });
      return;
    }

    const ticketTypeIds = [...new Set(attendees.map((a) => a.ticketTypeId))];
    const ticketTypes = await db
      .select()
      .from(ticketTypesTable)
      .where(and(
        inArray(ticketTypesTable.id, ticketTypeIds),
        eq(ticketTypesTable.eventId, eventId),
        eq(ticketTypesTable.isActive, true),
      ));

    const ticketTypeMap = new Map(ticketTypes.map((tt) => [tt.id, tt]));

    for (const attendee of attendees) {
      const tt = ticketTypeMap.get(attendee.ticketTypeId);
      if (!tt) {
        res.status(400).json({ error: `Ticket type ${attendee.ticketTypeId} not found or inactive` });
        return;
      }
      const now = new Date();
      if (tt.saleStart && now < tt.saleStart) {
        res.status(400).json({ error: `Sales for ${tt.name} haven't started yet` });
        return;
      }
      if (tt.saleEnd && now > tt.saleEnd) {
        res.status(400).json({ error: `Sales for ${tt.name} have ended` });
        return;
      }
    }

    const quantityByType = new Map<string, number>();
    for (const a of attendees) {
      quantityByType.set(a.ticketTypeId, (quantityByType.get(a.ticketTypeId) || 0) + 1);
    }

    for (const [typeId, qty] of quantityByType) {
      const tt = ticketTypeMap.get(typeId)!;
      if (tt.quantity - tt.soldCount < qty) {
        res.status(409).json({ error: `Not enough tickets available for ${tt.name}. Available: ${tt.quantity - tt.soldCount}` });
        return;
      }
    }

    let totalAmount = 0;
    for (const a of attendees) {
      totalAmount += ticketTypeMap.get(a.ticketTypeId)!.price;
    }

    const result = await db.transaction(async (tx) => {
      for (const [typeId, qty] of quantityByType) {
        const updated = await tx
          .update(ticketTypesTable)
          .set({
            soldCount: sql`${ticketTypesTable.soldCount} + ${qty}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(ticketTypesTable.id, typeId),
            sql`${ticketTypesTable.quantity} - ${ticketTypesTable.soldCount} >= ${qty}`,
          ))
          .returning({ id: ticketTypesTable.id });

        if (updated.length === 0) {
          throw new Error(`SOLD_OUT:${ticketTypeMap.get(typeId)!.name}`);
        }
      }

      const [order] = await tx
        .insert(ticketOrdersTable)
        .values({
          eventId,
          buyerUserId: null,
          buyerEmail,
          buyerName,
          totalAmount,
          ticketCount: attendees.length,
          paymentStatus: "pending",
          paymentMethod,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        })
        .returning();

      return order;
    }).catch((err) => {
      if (err.message?.startsWith("SOLD_OUT:")) {
        const name = err.message.replace("SOLD_OUT:", "");
        res.status(409).json({ error: `Tickets for ${name} are sold out` });
        return null;
      }
      throw err;
    });

    if (!result) return;
    const order = result;

    const reference = `ticket_${order.id}_${Date.now()}`;
    let wompiTransactionId: string | undefined;
    let paymentRedirectUrl: string | undefined;

    try {
      const acceptanceToken = await fetchWompiAcceptanceToken();
      const amountCentavos = totalAmount * 100;

      let wompiBody: Record<string, unknown>;

      if (paymentMethod === "card") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: buyerEmail,
          payment_method: { type: "CARD", token: cardToken, installments: installments ?? 1 },
          reference,
          acceptance_token: acceptanceToken,
        };
      } else if (paymentMethod === "nequi") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: buyerEmail,
          payment_method: { type: "NEQUI", phone_number: phoneNumber },
          reference,
          acceptance_token: acceptanceToken,
        };
      } else {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: buyerEmail,
          payment_method: {
            type: "PSE",
            user_type: 0,
            user_legal_id_type: userLegalIdType ?? "CC",
            user_legal_id: userLegalId!,
            financial_institution_code: bankCode,
            payment_description: `Entrada ${event.name}`,
          },
          reference,
          acceptance_token: acceptanceToken,
          redirect_url: redirectUrl ?? `${process.env.APP_URL ?? "https://example.com"}/payment-return`,
        };
      }

      const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        },
        body: JSON.stringify(wompiBody),
      });

      const wompiData = await wompiRes.json() as { data?: { id: string; payment_method?: { extra?: { async_payment_url?: string } } }; error?: unknown };
      if (!wompiRes.ok || !wompiData.data) {
        logger.error({ wompiData }, "Wompi guest ticket payment error");
        await db.update(ticketOrdersTable).set({ paymentStatus: "cancelled", updatedAt: new Date() }).where(eq(ticketOrdersTable.id, order.id));
        for (const [typeId, qty] of quantityByType) {
          await db.update(ticketTypesTable).set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${qty}, 0)`, updatedAt: new Date() }).where(eq(ticketTypesTable.id, typeId));
        }
        res.status(502).json({ error: "Failed to initiate payment. Try again." });
        return;
      }

      wompiTransactionId = wompiData.data.id;
      paymentRedirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
    } catch (err) {
      logger.error({ err }, "Wompi API error (guest purchase)");
      await db.update(ticketOrdersTable).set({ paymentStatus: "cancelled", updatedAt: new Date() }).where(eq(ticketOrdersTable.id, order.id));
      for (const [typeId, qty] of quantityByType) {
        await db.update(ticketTypesTable).set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${qty}, 0)`, updatedAt: new Date() }).where(eq(ticketTypesTable.id, typeId));
      }
      res.status(502).json({ error: "Payment gateway unavailable. Try again later." });
      return;
    }

    await db.update(ticketOrdersTable).set({ wompiTransactionId, wompiReference: reference, updatedAt: new Date() }).where(eq(ticketOrdersTable.id, order.id));

    await db.insert(wompiPaymentIntentsTable).values({
      amount: totalAmount,
      paymentMethod,
      wompiTransactionId,
      wompiReference: reference,
      status: "pending",
      performedByUserId: null,
      ticketOrderId: order.id,
      purposeType: "ticket",
    });

    for (const attendee of attendees) {
      const normalizedEmail = attendee.email.toLowerCase().trim();
      const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail));

      await db.insert(ticketsTable).values({
        orderId: order.id,
        ticketTypeId: attendee.ticketTypeId,
        eventId,
        attendeeName: attendee.name,
        attendeeEmail: normalizedEmail,
        attendeePhone: attendee.phone ?? null,
        attendeeUserId: existingUser?.id ?? null,
        status: "valid",
      });
    }

    res.status(201).json({
      orderId: order.id,
      totalAmount,
      ticketCount: attendees.length,
      paymentMethod,
      wompiTransactionId: wompiTransactionId ?? null,
      redirectUrl: paymentRedirectUrl ?? null,
      status: "pending",
    });
  },
);

router.get(
  "/public/orders/:orderId/status",
  async (req: Request, res: Response) => {
    const { orderId } = req.params as { orderId: string };

    const [order] = await db
      .select({
        id: ticketOrdersTable.id,
        paymentStatus: ticketOrdersTable.paymentStatus,
        ticketCount: ticketOrdersTable.ticketCount,
        totalAmount: ticketOrdersTable.totalAmount,
        buyerEmail: ticketOrdersTable.buyerEmail,
      })
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.id, orderId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({
      orderId: order.id,
      status: order.paymentStatus,
      ticketCount: order.ticketCount,
      totalAmount: order.totalAmount,
    });
  },
);

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, eventDaysTable, venuesTable, venueSectionsTable, ticketTypesTable, ticketTypeUnitsTable, ticketPricingStagesTable, ticketOrdersTable, ticketsTable, wompiPaymentIntentsTable, usersTable, guestListsTable, promoterCompaniesTable } from "@workspace/db";
import { eq, and, sql, ilike, gte, lte, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { findOrCreateAttendeeAccount } from "../lib/attendeeAccounts";

const router: IRouter = Router();

function resolveActiveStage(stages: { price: number; startsAt: Date; endsAt: Date; name: string; displayOrder: number }[]) {
  const now = new Date();
  const sorted = [...stages].sort((a, b) => a.displayOrder - b.displayOrder || a.startsAt.getTime() - b.startsAt.getTime());
  const active = sorted.find((s) => now >= s.startsAt && now <= s.endsAt);
  const nextStage = active
    ? sorted.find((s) => s.startsAt > active.endsAt)
    : sorted.find((s) => s.startsAt > now);
  return { active, nextStage };
}

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
        slug: eventsTable.slug,
        description: eventsTable.description,
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
      })
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(asc(eventsTable.startsAt))
      .limit(limitNum)
      .offset(offset);

    const eventsWithPricing = await Promise.all(
      events.map(async (event) => {
        const activeTypes = await db
          .select({ id: ticketTypesTable.id, price: ticketTypesTable.price })
          .from(ticketTypesTable)
          .where(and(eq(ticketTypesTable.eventId, event.id), eq(ticketTypesTable.isActive, true)));

        let prices: number[] = [];
        if (activeTypes.length > 0) {
          const typeIds = activeTypes.map((t) => t.id);
          const stages = await db
            .select()
            .from(ticketPricingStagesTable)
            .where(inArray(ticketPricingStagesTable.ticketTypeId, typeIds))
            .orderBy(asc(ticketPricingStagesTable.displayOrder), asc(ticketPricingStagesTable.startsAt));

          const stgMap = new Map<string, typeof stages>();
          for (const s of stages) {
            const arr = stgMap.get(s.ticketTypeId) ?? [];
            arr.push(s);
            stgMap.set(s.ticketTypeId, arr);
          }

          prices = activeTypes.map((tt) => {
            const ttStages = stgMap.get(tt.id) ?? [];
            if (ttStages.length === 0) return tt.price;
            const { active } = resolveActiveStage(ttStages);
            return active ? active.price : tt.price;
          });
        }

        const days = await db
          .select({ id: eventDaysTable.id, date: eventDaysTable.date, label: eventDaysTable.label })
          .from(eventDaysTable)
          .where(eq(eventDaysTable.eventId, event.id))
          .orderBy(asc(eventDaysTable.displayOrder));

        const paidPrices = prices.filter((p) => p > 0);
        return {
          ...event,
          priceFrom: paidPrices.length > 0 ? Math.min(...paidPrices) : 0,
          priceTo: prices.length > 0 ? Math.max(...prices) : 0,
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
  "/public/events/:eventIdOrSlug",
  async (req: Request, res: Response) => {
    const { eventIdOrSlug } = req.params as { eventIdOrSlug: string };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrSlug);
    const lookupCondition = isUuid
      ? eq(eventsTable.id, eventIdOrSlug)
      : eq(eventsTable.slug, eventIdOrSlug);

    try {
      const [event] = await db
        .select({
          id: eventsTable.id,
          name: eventsTable.name,
          slug: eventsTable.slug,
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
          promoterCompanyId: eventsTable.promoterCompanyId,
          pulepId: eventsTable.pulepId,
        })
        .from(eventsTable)
        .where(and(lookupCondition, eq(eventsTable.active, true)));

      if (!event) {
        res.status(404).json({ error: "Event not found" });
        return;
      }

      if (!event.ticketingEnabled) {
        res.status(404).json({ error: "Ticketing is not enabled for this event" });
        return;
      }

      const eventId = event.id;

      let promoterCompany: { companyName: string; nit: string | null } | null = null;
      if (event.promoterCompanyId) {
        const [pc] = await db
          .select({ companyName: promoterCompaniesTable.companyName, nit: promoterCompaniesTable.nit })
          .from(promoterCompaniesTable)
          .where(eq(promoterCompaniesTable.id, event.promoterCompanyId));
        promoterCompany = pc || null;
      }

      const days = await db
        .select({
          id: eventDaysTable.id,
          eventId: eventDaysTable.eventId,
          date: eventDaysTable.date,
          label: eventDaysTable.label,
          doorsOpenAt: eventDaysTable.doorsOpenAt,
          doorsCloseAt: eventDaysTable.doorsCloseAt,
          displayOrder: eventDaysTable.displayOrder,
        })
        .from(eventDaysTable)
        .where(eq(eventDaysTable.eventId, eventId))
        .orderBy(asc(eventDaysTable.displayOrder), asc(eventDaysTable.date));

      const venues = await db
        .select({
          id: venuesTable.id,
          eventId: venuesTable.eventId,
          name: venuesTable.name,
          address: venuesTable.address,
          city: venuesTable.city,
          latitude: venuesTable.latitude,
          longitude: venuesTable.longitude,
          floorplanImageUrl: venuesTable.floorplanImageUrl,
        })
        .from(venuesTable)
        .where(eq(venuesTable.eventId, eventId));

      const sections = venues.length > 0
        ? await db
            .select({
              id: venueSectionsTable.id,
              venueId: venueSectionsTable.venueId,
              name: venueSectionsTable.name,
              capacity: venueSectionsTable.capacity,
              totalTickets: venueSectionsTable.totalTickets,
              soldTickets: venueSectionsTable.soldTickets,
              colorHex: venueSectionsTable.colorHex,
              sectionType: venueSectionsTable.sectionType,
              svgPathData: venueSectionsTable.svgPathData,
              displayOrder: venueSectionsTable.displayOrder,
            })
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
              serviceFee: ticketTypesTable.serviceFee,
              serviceFeeType: ticketTypesTable.serviceFeeType,
              quantity: ticketTypesTable.quantity,
              soldCount: ticketTypesTable.soldCount,
              saleStart: ticketTypesTable.saleStart,
              saleEnd: ticketTypesTable.saleEnd,
              isActive: ticketTypesTable.isActive,
              validEventDayIds: ticketTypesTable.validEventDayIds,
              sectionId: ticketTypesTable.sectionId,
              isNumberedUnits: ticketTypesTable.isNumberedUnits,
              unitLabel: ticketTypesTable.unitLabel,
              ticketsPerUnit: ticketTypesTable.ticketsPerUnit,
            })
            .from(ticketTypesTable)
            .where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.isActive, true)))
        : [];

      const allStages = ticketTypes.length > 0
        ? await db
            .select({
              id: ticketPricingStagesTable.id,
              ticketTypeId: ticketPricingStagesTable.ticketTypeId,
              name: ticketPricingStagesTable.name,
              price: ticketPricingStagesTable.price,
              startsAt: ticketPricingStagesTable.startsAt,
              endsAt: ticketPricingStagesTable.endsAt,
              displayOrder: ticketPricingStagesTable.displayOrder,
            })
            .from(ticketPricingStagesTable)
            .where(inArray(ticketPricingStagesTable.ticketTypeId, ticketTypes.map((t) => t.id)))
            .orderBy(asc(ticketPricingStagesTable.displayOrder), asc(ticketPricingStagesTable.startsAt))
        : [];

      const stagesByType = new Map<string, typeof allStages>();
      for (const s of allStages) {
        const arr = stagesByType.get(s.ticketTypeId) ?? [];
        arr.push(s);
        stagesByType.set(s.ticketTypeId, arr);
      }

      const numberedTypeIds = ticketTypes.filter((tt) => tt.isNumberedUnits).map((tt) => tt.id);
      const allUnits = numberedTypeIds.length > 0
        ? await db
            .select({
              id: ticketTypeUnitsTable.id,
              ticketTypeId: ticketTypeUnitsTable.ticketTypeId,
              unitNumber: ticketTypeUnitsTable.unitNumber,
              unitLabel: ticketTypeUnitsTable.unitLabel,
              status: ticketTypeUnitsTable.status,
              mapX: ticketTypeUnitsTable.mapX,
              mapY: ticketTypeUnitsTable.mapY,
            })
            .from(ticketTypeUnitsTable)
            .where(inArray(ticketTypeUnitsTable.ticketTypeId, numberedTypeIds))
            .orderBy(asc(ticketTypeUnitsTable.unitNumber))
        : [];
      const unitsByType = new Map<string, typeof allUnits>();
      for (const u of allUnits) {
        const arr = unitsByType.get(u.ticketTypeId) ?? [];
        arr.push(u);
        unitsByType.set(u.ticketTypeId, arr);
      }

      const availability = ticketTypes.map((tt) => {
        const stages = stagesByType.get(tt.id) ?? [];
        const { active, nextStage } = resolveActiveStage(stages);
        const currentPrice = active ? active.price : tt.price;
        const currentStageName = active ? active.name : null;

        const units = tt.isNumberedUnits ? (unitsByType.get(tt.id) ?? []) : [];

        return {
          ticketTypeId: tt.id,
          name: tt.name,
          basePrice: tt.price,
          currentPrice,
          currentStageName,
          serviceFee: tt.serviceFee,
          serviceFeeType: tt.serviceFeeType,
          available: tt.quantity - tt.soldCount,
          total: tt.quantity,
          saleStart: tt.saleStart,
          saleEnd: tt.saleEnd,
          validEventDayIds: tt.validEventDayIds,
          sectionId: tt.sectionId,
          isNumberedUnits: tt.isNumberedUnits,
          unitLabel: tt.unitLabel,
          ticketsPerUnit: tt.ticketsPerUnit,
          units: units.map((u) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            unitLabel: u.unitLabel,
            status: u.status,
            mapX: u.mapX ? parseFloat(u.mapX) : null,
            mapY: u.mapY ? parseFloat(u.mapY) : null,
          })),
          pricingStages: stages.map((s) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
          })),
          nextStage: nextStage ? {
            name: nextStage.name,
            price: nextStage.price,
            startsAt: nextStage.startsAt,
          } : null,
        };
      });

      const publicGuestLists = await db
        .select({
          id: guestListsTable.id,
          name: guestListsTable.name,
          slug: guestListsTable.slug,
          maxGuests: guestListsTable.maxGuests,
          currentCount: guestListsTable.currentCount,
          expiresAt: guestListsTable.expiresAt,
        })
        .from(guestListsTable)
        .where(
          and(
            eq(guestListsTable.eventId, eventId),
            eq(guestListsTable.isPublic, true),
            eq(guestListsTable.status, "active"),
          ),
        )
        .orderBy(asc(guestListsTable.name));

      const activeGuestLists = publicGuestLists.filter((gl) => {
        if (gl.expiresAt && new Date(gl.expiresAt) < new Date()) return false;
        if (gl.currentCount >= gl.maxGuests) return false;
        return true;
      });

      res.json({
        event: { ...event, pulepId: event.pulepId || null },
        eventDays: days,
        venues,
        sections,
        ticketTypes: availability,
        guestLists: activeGuestLists,
        promoterCompany,
      });
    } catch (err) {
      logger.error({ err, eventId }, "Failed to fetch event detail");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";

async function fetchWompiTokens(): Promise<{ acceptanceToken: string; personalAuthToken: string }> {
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Wompi merchants/${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    data: {
      presigned_acceptance: { acceptance_token: string };
      presigned_personal_data_auth: { acceptance_token: string };
    };
  };
  return {
    acceptanceToken: data.data.presigned_acceptance.acceptance_token,
    personalAuthToken: data.data.presigned_personal_data_auth.acceptance_token,
  };
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
  attendees: z.array(guestAttendeeSchema).min(1).max(50),
  unitSelections: z.array(z.object({
    ticketTypeId: z.string().min(1),
    unitId: z.string().min(1),
  })).optional(),
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

    const { eventId, buyerName, buyerEmail, attendees, unitSelections, paymentMethod, cardToken, phoneNumber, bankCode, userLegalIdType, userLegalId, installments, redirectUrl } = parsed.data;

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

    const unitSelMap = new Map<string, string>();
    if (unitSelections) {
      for (const us of unitSelections) {
        const tt = ticketTypeMap.get(us.ticketTypeId);
        if (!tt || !tt.isNumberedUnits) {
          res.status(400).json({ error: `Unit selection invalid for ticket type ${us.ticketTypeId}` });
          return;
        }
        unitSelMap.set(us.ticketTypeId, us.unitId);
      }
    }

    for (const tt of ticketTypes) {
      if (tt.isNumberedUnits && !unitSelMap.has(tt.id)) {
        res.status(400).json({ error: `Unit selection required for ${tt.name}` });
        return;
      }
    }

    const quantityByType = new Map<string, number>();
    for (const a of attendees) {
      quantityByType.set(a.ticketTypeId, (quantityByType.get(a.ticketTypeId) || 0) + 1);
    }

    for (const [typeId, qty] of quantityByType) {
      const tt = ticketTypeMap.get(typeId)!;
      if (!tt.isNumberedUnits) {
        if (tt.quantity - tt.soldCount < qty) {
          res.status(409).json({ error: `Not enough tickets available for ${tt.name}. Available: ${tt.quantity - tt.soldCount}` });
          return;
        }
      }
    }

    const purchaseStages = await db
      .select()
      .from(ticketPricingStagesTable)
      .where(inArray(ticketPricingStagesTable.ticketTypeId, ticketTypeIds))
      .orderBy(asc(ticketPricingStagesTable.displayOrder), asc(ticketPricingStagesTable.startsAt));

    const purchaseStagesByType = new Map<string, typeof purchaseStages>();
    for (const s of purchaseStages) {
      const arr = purchaseStagesByType.get(s.ticketTypeId) ?? [];
      arr.push(s);
      purchaseStagesByType.set(s.ticketTypeId, arr);
    }

    let totalAmount = 0;
    const processedUnitTypes = new Set<string>();
    for (const a of attendees) {
      const tt = ticketTypeMap.get(a.ticketTypeId)!;
      const stages = purchaseStagesByType.get(a.ticketTypeId) ?? [];
      const { active } = resolveActiveStage(stages);
      const unitPrice = active ? active.price : tt.price;
      if (tt.isNumberedUnits) {
        if (!processedUnitTypes.has(tt.id)) {
          processedUnitTypes.add(tt.id);
          totalAmount += unitPrice;
        }
      } else {
        totalAmount += unitPrice;
      }
    }

    const result = await db.transaction(async (tx) => {
      for (const [typeId, qty] of quantityByType) {
        const tt = ticketTypeMap.get(typeId)!;

        if (tt.isNumberedUnits) {
          const unitId = unitSelMap.get(typeId)!;
          const [lockedUnit] = await tx
            .update(ticketTypeUnitsTable)
            .set({ status: "sold" })
            .where(and(
              eq(ticketTypeUnitsTable.id, unitId),
              eq(ticketTypeUnitsTable.ticketTypeId, typeId),
              eq(ticketTypeUnitsTable.status, "available"),
            ))
            .returning({ id: ticketTypeUnitsTable.id });

          if (!lockedUnit) {
            throw new Error(`UNIT_TAKEN:${tt.name}`);
          }

          await tx
            .update(ticketTypesTable)
            .set({
              soldCount: sql`${ticketTypesTable.soldCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(ticketTypesTable.id, typeId));
        } else {
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
            throw new Error(`SOLD_OUT:${tt.name}`);
          }
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

      for (const [typeId, unitId] of unitSelMap) {
        await tx
          .update(ticketTypeUnitsTable)
          .set({ orderId: order.id })
          .where(eq(ticketTypeUnitsTable.id, unitId));
      }

      return order;
    }).catch((err) => {
      if (err.message?.startsWith("SOLD_OUT:") || err.message?.startsWith("UNIT_TAKEN:")) {
        const name = err.message.replace(/^(SOLD_OUT|UNIT_TAKEN):/, "");
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
      const { acceptanceToken, personalAuthToken } = await fetchWompiTokens();
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
          acceptance_personal_auth_token: personalAuthToken,
        };
      } else if (paymentMethod === "nequi") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: buyerEmail,
          payment_method: { type: "NEQUI", phone_number: phoneNumber },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
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
          acceptance_personal_auth_token: personalAuthToken,
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
          const tt = ticketTypeMap.get(typeId);
          const dec = tt?.isNumberedUnits ? 1 : qty;
          await db.update(ticketTypesTable).set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${dec}, 0)`, updatedAt: new Date() }).where(eq(ticketTypesTable.id, typeId));
        }
        for (const [, unitId] of unitSelMap) {
          await db.update(ticketTypeUnitsTable).set({ status: "available", orderId: null }).where(eq(ticketTypeUnitsTable.id, unitId));
        }
        res.status(502).json({ error: "Failed to initiate payment. Try again." });
        return;
      }

      wompiTransactionId = wompiData.data.id;
      paymentRedirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, errMsg, wompiBaseUrl: WOMPI_BASE_URL }, "Wompi API error (guest purchase)");
      await db.update(ticketOrdersTable).set({ paymentStatus: "cancelled", updatedAt: new Date() }).where(eq(ticketOrdersTable.id, order.id));
      for (const [typeId, qty] of quantityByType) {
        const tt = ticketTypeMap.get(typeId);
        const dec = tt?.isNumberedUnits ? 1 : qty;
        await db.update(ticketTypesTable).set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${dec}, 0)`, updatedAt: new Date() }).where(eq(ticketTypesTable.id, typeId));
      }
      for (const [, unitId] of unitSelMap) {
        await db.update(ticketTypeUnitsTable).set({ status: "available", orderId: null }).where(eq(ticketTypeUnitsTable.id, unitId));
      }
      res.status(502).json({ error: `Payment gateway error: ${errMsg}` });
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
      const { userId: attendeeUserId } = await findOrCreateAttendeeAccount(
        normalizedEmail,
        attendee.name,
        attendee.phone,
      );

      await db.insert(ticketsTable).values({
        orderId: order.id,
        ticketTypeId: attendee.ticketTypeId,
        eventId,
        unitId: unitSelMap.get(attendee.ticketTypeId) ?? null,
        attendeeName: attendee.name,
        attendeeEmail: normalizedEmail,
        attendeePhone: attendee.phone ?? null,
        attendeeUserId,
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

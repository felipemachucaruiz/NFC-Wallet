import { Router, type Request, type Response } from "express";
import { db, eventsTable, ticketTypesTable, ticketPricingStagesTable } from "@workspace/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Bogota",
  });
}

function formatTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "America/Bogota",
  });
}

/**
 * GET /api/wati/events
 *
 * Public endpoint for WATI flow builder to fetch active events with ticket prices.
 * No authentication required — data is publicly available on tapeetickets.com.
 *
 * Optional query params:
 *   ?limit=5        → max number of events (default 5, max 10)
 *   ?eventId=uuid   → return a single event's details
 */
router.get("/wati/events", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit as string) || 5));
    const eventId = req.query.eventId as string | undefined;

    const conditions = [
      eq(eventsTable.active, true),
      eq(eventsTable.ticketingEnabled, true),
      gte(eventsTable.startsAt, now),
    ];

    if (eventId) conditions.push(eq(eventsTable.id, eventId));

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        slug: eventsTable.slug,
        description: eventsTable.description,
        venueAddress: eventsTable.venueAddress,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        coverImageUrl: eventsTable.coverImageUrl,
        saleStartsAt: eventsTable.saleStartsAt,
        saleEndsAt: eventsTable.saleEndsAt,
      })
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(asc(eventsTable.startsAt))
      .limit(limit);

    const result = await Promise.all(
      events.map(async (event) => {
        const now2 = new Date();

        // Active ticket types with at least one available stage
        const ticketTypes = await db
          .select({
            id: ticketTypesTable.id,
            name: ticketTypesTable.name,
            price: ticketTypesTable.price,
            serviceFee: ticketTypesTable.serviceFee,
            serviceFeeType: ticketTypesTable.serviceFeeType,
            quantity: ticketTypesTable.quantity,
            soldCount: ticketTypesTable.soldCount,
          })
          .from(ticketTypesTable)
          .where(
            and(
              eq(ticketTypesTable.eventId, event.id),
              sql`(${ticketTypesTable.saleStart} IS NULL OR ${ticketTypesTable.saleStart} <= ${now2})`,
              sql`(${ticketTypesTable.saleEnd} IS NULL OR ${ticketTypesTable.saleEnd} >= ${now2})`,
            ),
          )
          .orderBy(asc(ticketTypesTable.price));

        // Get active pricing stages per ticket type
        const stages = ticketTypes.length > 0
          ? await db
            .select({
              ticketTypeId: ticketPricingStagesTable.ticketTypeId,
              price: ticketPricingStagesTable.price,
              name: ticketPricingStagesTable.name,
              quantity: ticketPricingStagesTable.quantity,
              soldCount: ticketPricingStagesTable.soldCount,
              startsAt: ticketPricingStagesTable.startsAt,
              endsAt: ticketPricingStagesTable.endsAt,
            })
            .from(ticketPricingStagesTable)
            .where(
              sql`${ticketPricingStagesTable.ticketTypeId} = ANY(ARRAY[${sql.join(ticketTypes.map((t) => sql`${t.id}::varchar`), sql`, `)}]::varchar[])`,
            )
          : [];

        const formattedTypes = ticketTypes.map((tt) => {
          const typeStages = stages.filter((s) => s.ticketTypeId === tt.id);
          const activeStage = typeStages.find(
            (s) => now2 >= new Date(s.startsAt!) && now2 <= new Date(s.endsAt!) &&
              (s.quantity === null || s.soldCount < s.quantity),
          );
          const currentPrice = activeStage ? activeStage.price : tt.price;

          const fee = tt.serviceFeeType === "percent"
            ? Math.round(currentPrice * (tt.serviceFee / 100))
            : tt.serviceFee;
          const totalPrice = currentPrice + fee;

          const available = tt.quantity === null ? null : tt.quantity - tt.soldCount;

          return {
            name: tt.name,
            price: formatCOP(currentPrice),
            serviceFee: fee > 0 ? formatCOP(fee) : null,
            totalPrice: formatCOP(totalPrice),
            available: available === null ? "Disponible" : available > 0 ? `${available} disponibles` : "Agotado",
            stageName: activeStage?.name ?? null,
          };
        });

        const saleOpen = (
          (!event.saleStartsAt || now >= new Date(event.saleStartsAt)) &&
          (!event.saleEndsAt || now <= new Date(event.saleEndsAt))
        );

        return {
          id: event.id,
          name: event.name,
          slug: event.slug,
          description: event.description ?? "",
          venue: event.venueAddress ?? "",
          date: formatDate(event.startsAt),
          time: formatTime(event.startsAt),
          endDate: event.endsAt ? formatDate(event.endsAt) : null,
          link: `https://tapeetickets.com/events/${event.slug}`,
          coverImageUrl: event.coverImageUrl ?? null,
          onSale: saleOpen,
          ticketTypes: formattedTypes,
          // Flat summary for use as a single WATI template variable
          summary: formattedTypes.length > 0
            ? formattedTypes.map((t) => `• ${t.name}: ${t.totalPrice}${t.stageName ? ` (${t.stageName})` : ""} — ${t.available}`).join("\n")
            : "Próximamente",
        };
      }),
    );

    // Also provide a flat text list useful for WATI template variables
    const textList = result
      .map((e, i) => `${i + 1}. *${e.name}*\n   📅 ${e.date} a las ${e.time}\n   📍 ${e.venue}\n   🎟️ Desde ${e.ticketTypes[0]?.totalPrice ?? "Ver sitio"}\n   🔗 ${e.link}`)
      .join("\n\n");

    res.json({
      count: result.length,
      events: result,
      // Convenience field: ready-to-paste text for a WATI text message
      eventsText: textList || "No hay eventos disponibles por el momento.",
    });
  } catch (err) {
    logger.error({ err }, "WATI events webhook error");
    res.status(500).json({ error: "Internal error", events: [], eventsText: "No hay eventos disponibles en este momento." });
  }
});

/**
 * GET /api/wati/catalog.csv
 *
 * Meta WhatsApp Business Catalog data feed (CSV format).
 * Point Meta Business Manager → Commerce Manager → Data Feed to this URL.
 * Meta will pull it automatically on the configured schedule (hourly/daily).
 *
 * Required columns per Meta spec:
 * id, title, description, availability, condition, price, link, image_link, brand
 */
router.get("/wati/catalog.csv", async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        slug: eventsTable.slug,
        description: eventsTable.description,
        longDescription: eventsTable.longDescription,
        venueAddress: eventsTable.venueAddress,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        coverImageUrl: eventsTable.coverImageUrl,
        flyerImageUrl: eventsTable.flyerImageUrl,
        saleStartsAt: eventsTable.saleStartsAt,
        saleEndsAt: eventsTable.saleEndsAt,
        active: eventsTable.active,
        ticketingEnabled: eventsTable.ticketingEnabled,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.active, true), eq(eventsTable.ticketingEnabled, true), gte(eventsTable.startsAt, now)))
      .orderBy(asc(eventsTable.startsAt));

    // Get cheapest available ticket type per event
    const eventIds = events.map((e) => e.id);
    const allTicketTypes = eventIds.length > 0
      ? await db
        .select({
          eventId: ticketTypesTable.eventId,
          price: ticketTypesTable.price,
          serviceFee: ticketTypesTable.serviceFee,
          serviceFeeType: ticketTypesTable.serviceFeeType,
          quantity: ticketTypesTable.quantity,
          soldCount: ticketTypesTable.soldCount,
        })
        .from(ticketTypesTable)
        .where(
          sql`${ticketTypesTable.eventId} = ANY(ARRAY[${sql.join(eventIds.map((id) => sql`${id}::varchar`), sql`, `)}]::varchar[])`,
        )
        .orderBy(asc(ticketTypesTable.price))
      : [];

    function csvEscape(val: string): string {
      if (val.includes('"') || val.includes(',') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }

    const headers = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "google_product_category"];
    const rows: string[] = [headers.join(",")];

    for (const event of events) {
      const eventTickets = allTicketTypes.filter((t) => t.eventId === event.id);
      const cheapest = eventTickets[0];

      const saleOpen = (
        (!event.saleStartsAt || now >= new Date(event.saleStartsAt)) &&
        (!event.saleEndsAt || now <= new Date(event.saleEndsAt)) &&
        !!event.startsAt && now <= new Date(event.startsAt)
      );
      const hasSoldOut = cheapest && cheapest.quantity !== null && cheapest.soldCount >= cheapest.quantity;
      const availability = (saleOpen && !hasSoldOut) ? "in stock" : "out of stock";

      // Price in "AMOUNT CURRENCY" format Meta requires
      let priceStr = "0 COP";
      if (cheapest) {
        const fee = cheapest.serviceFeeType === "percent"
          ? Math.round(cheapest.price * (cheapest.serviceFee / 100))
          : cheapest.serviceFee;
        const totalCents = cheapest.price + fee;
        // Meta wants price in major currency units (not cents), with 2 decimals
        priceStr = `${(totalCents / 100).toFixed(2)} COP`;
      }

      const dateStr = event.startsAt ? formatDate(event.startsAt) : "";
      const description = [
        event.description ?? "",
        dateStr ? `📅 ${dateStr}` : "",
        event.venueAddress ? `📍 ${event.venueAddress}` : "",
      ].filter(Boolean).join(" · ").slice(0, 9999);

      const makeAbsolute = (path: string | null) => {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return `https://attendee.tapee.app/attendee-api${path}`;
      };
      const imageUrl = makeAbsolute(event.coverImageUrl || event.flyerImageUrl || "");
      const link = `https://tapeetickets.com/events/${event.slug}`;

      const row = [
        csvEscape(event.id),
        csvEscape(event.name),
        csvEscape(description),
        csvEscape(availability),
        "new",
        csvEscape(priceStr),
        csvEscape(link),
        csvEscape(imageUrl),
        "Tapee",
        "1",   // Arts & Entertainment
      ];
      rows.push(row.join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=\"tapee-catalog.csv\"");
    res.send(rows.join("\n"));
  } catch (err) {
    logger.error({ err }, "WATI catalog feed error");
    res.status(500).send("Internal error");
  }
});

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, eventDaysTable, venuesTable, venueSectionsTable, ticketTypesTable, ticketTypeUnitsTable, ticketOrdersTable, ticketsTable, wompiPaymentIntentsTable, usersTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import crypto from "crypto";
import { generateTicketQrToken } from "../lib/ticketQr";
import { sendTicketConfirmationEmail, sendTicketInvitationEmail } from "../lib/ticketEmails";
import { generateGoogleWalletSaveLink } from "../lib/walletPasses";
import { generateTicketPdf } from "../lib/ticketPdf";
import { sendWhatsAppDocument, sendWhatsAppText, isWhatsAppConfigured } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";

const SUPPORTED_LOCALES = ["es", "en"] as const;

function parseAcceptLocale(header?: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(",").map((p) => {
    const [lang, qPart] = p.trim().split(";");
    const q = qPart ? parseFloat(qPart.replace(/q=/, "")) : 1;
    return { lang: lang.trim().toLowerCase(), q: isNaN(q) ? 0 : q };
  });
  parts.sort((a, b) => b.q - a.q);
  for (const { lang } of parts) {
    const base = lang.split("-")[0];
    if (SUPPORTED_LOCALES.includes(base as typeof SUPPORTED_LOCALES[number])) return base;
  }
  return undefined;
}

async function fetchWompiAcceptanceToken(): Promise<string> {
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch Wompi acceptance token");
  const data = await res.json() as { data: { presigned_acceptance: { acceptance_token: string } } };
  return data.data.presigned_acceptance.acceptance_token;
}

const attendeeDataSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  ticketTypeId: z.string().min(1),
});

const createOrderSchema = z.object({
  eventId: z.string().min(1),
  attendees: z.array(attendeeDataSchema).min(1).max(50),
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
});

router.post(
  "/tickets/purchase",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
      res.status(503).json({ error: "Payment gateway not configured" });
      return;
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { eventId, attendees, unitSelections, paymentMethod, cardToken, phoneNumber, bankCode, userLegalIdType, userLegalId, installments } = parsed.data;

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

    let totalAmount = 0;
    for (const a of attendees) {
      const tt = ticketTypeMap.get(a.ticketTypeId)!;
      if (tt.isNumberedUnits) {
        totalAmount += tt.price / (tt.ticketsPerUnit || 1);
      } else {
        totalAmount += tt.price;
      }
    }

    const [userRecord] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const customerEmail = userRecord?.email || `attendee_${req.user.id}@evento.local`;
    const buyerName = userRecord ? `${userRecord.firstName || ""} ${userRecord.lastName || ""}`.trim() : "Attendee";

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
          buyerUserId: req.user.id,
          buyerEmail: customerEmail,
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
    let redirectUrl: string | undefined;

    try {
      const acceptanceToken = await fetchWompiAcceptanceToken();
      const amountCentavos = totalAmount * 100;

      let wompiBody: Record<string, unknown>;

      if (paymentMethod === "card") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "CARD",
            token: cardToken,
            installments: installments ?? 1,
          },
          reference,
          acceptance_token: acceptanceToken,
        };
      } else if (paymentMethod === "nequi") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "NEQUI",
            phone_number: phoneNumber,
          },
          reference,
          acceptance_token: acceptanceToken,
        };
      } else {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
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
          redirect_url: `${process.env.APP_URL ?? "https://example.com"}/payment-return`,
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
        logger.error({ wompiData }, "Wompi ticket payment error");
        await rollbackOrderInventory(order.id, quantityByType, ticketTypeMap, unitSelMap);
        res.status(502).json({ error: "Failed to initiate payment. Try again." });
        return;
      }

      wompiTransactionId = wompiData.data.id;
      redirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
    } catch (err) {
      logger.error({ err }, "Wompi API error");
      await rollbackOrderInventory(order.id, quantityByType, ticketTypeMap, unitSelMap);
      res.status(502).json({ error: "Payment gateway unavailable. Try again later." });
      return;
    }

    await db
      .update(ticketOrdersTable)
      .set({ wompiTransactionId, wompiReference: reference, updatedAt: new Date() })
      .where(eq(ticketOrdersTable.id, order.id));

    await db
      .insert(wompiPaymentIntentsTable)
      .values({
        amount: totalAmount,
        paymentMethod,
        wompiTransactionId,
        wompiReference: reference,
        status: "pending",
        performedByUserId: req.user.id,
        ticketOrderId: order.id,
        purposeType: "ticket",
      });

    for (const attendee of attendees) {
      const normalizedEmail = attendee.email.toLowerCase().trim();
      const [existingUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail));

      await db
        .insert(ticketsTable)
        .values({
          orderId: order.id,
          ticketTypeId: attendee.ticketTypeId,
          eventId,
          unitId: unitSelMap.get(attendee.ticketTypeId) ?? null,
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
      wompiTransactionId,
      redirectUrl: redirectUrl ?? null,
      status: "pending",
    });
  },
);

router.get(
  "/tickets/orders/:orderId/status",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { orderId } = req.params as { orderId: string };

    const [order] = await db
      .select()
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.id, orderId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.buyerUserId !== req.user.id && req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (order.paymentStatus === "pending" && order.wompiTransactionId && WOMPI_PRIVATE_KEY) {
      try {
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${order.wompiTransactionId}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const wompiData = await wompiRes.json() as { data?: { status: string } };
        if (wompiRes.ok && wompiData.data) {
          if (wompiData.data.status === "APPROVED") {
            const reqLocale = parseAcceptLocale(req.headers["accept-language"]);
            await processTicketOrderPayment(order.id, order.wompiTransactionId!, reqLocale);
            const [updated] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, orderId));
            res.json({ orderId: updated.id, status: updated.paymentStatus });
            return;
          } else if (["DECLINED", "ERROR", "VOIDED"].includes(wompiData.data.status)) {
            await cancelTicketOrder(order.id);
            res.json({ orderId, status: "cancelled" });
            return;
          }
        }
      } catch (err) {
        logger.error({ err }, "Wompi status poll error");
      }
    }

    res.json({ orderId: order.id, status: order.paymentStatus });
  },
);

router.get(
  "/tickets/my-tickets",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const tickets = await db
      .select({
        id: ticketsTable.id,
        eventId: ticketsTable.eventId,
        attendeeName: ticketsTable.attendeeName,
        status: ticketsTable.status,
        ticketTypeId: ticketsTable.ticketTypeId,
        qrCodeToken: ticketsTable.qrCodeToken,
        orderId: ticketsTable.orderId,
        createdAt: ticketsTable.createdAt,
      })
      .from(ticketsTable)
      .where(eq(ticketsTable.attendeeUserId, req.user.id));

    const enriched = await Promise.all(
      tickets.map(async (ticket) => {
        const [event] = await db
          .select({ name: eventsTable.name, startsAt: eventsTable.startsAt, coverImageUrl: eventsTable.coverImageUrl })
          .from(eventsTable)
          .where(eq(eventsTable.id, ticket.eventId));

        const [ticketType] = ticket.ticketTypeId
          ? await db
              .select({ name: ticketTypesTable.name, validEventDayIds: ticketTypesTable.validEventDayIds })
              .from(ticketTypesTable)
              .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
          : [undefined];

        return {
          ...ticket,
          eventName: event?.name ?? null,
          eventStartsAt: event?.startsAt ?? null,
          eventCoverImage: event?.coverImageUrl ?? null,
          ticketTypeName: ticketType?.name ?? null,
          validEventDayIds: ticketType?.validEventDayIds ?? [],
        };
      }),
    );

    res.json({ tickets: enriched });
  },
);

const PDF_TOKEN_SECRET = process.env.HMAC_SECRET || process.env.TICKET_QR_SECRET;
if (!PDF_TOKEN_SECRET) {
  console.warn("[tickets] WARNING: HMAC_SECRET / TICKET_QR_SECRET not set — PDF download endpoint will reject all requests");
}

function generatePdfToken(ticketId: string): string {
  if (!PDF_TOKEN_SECRET) throw new Error("PDF_TOKEN_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${ticketId}:${exp}`;
  const sig = crypto.createHmac("sha256", PDF_TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyPdfToken(token: string, ticketId: string): boolean {
  if (!PDF_TOKEN_SECRET) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;
    const [tid, expStr, sig] = parts;
    if (tid !== ticketId) return false;
    const exp = parseInt(expStr);
    if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expectedSig = crypto.createHmac("sha256", PDF_TOKEN_SECRET).update(`${tid}:${expStr}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

router.get(
  "/tickets/:ticketId/pdf",
  async (req: Request, res: Response) => {
    const { ticketId } = req.params as { ticketId: string };
    const token = req.query.token as string;

    if (!token || !verifyPdfToken(token, ticketId)) {
      res.status(403).json({ error: "Invalid or expired token" });
      return;
    }

    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId));
    if (!ticket || !ticket.qrCodeToken) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [order] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId));
    const [event] = order ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId)) : [undefined];

    let sectionName = "General";
    let ticketTypeName = "";
    let validDays: string[] = [];

    if (ticket.ticketTypeId) {
      const [ticketType] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
      if (ticketType) {
        ticketTypeName = ticketType.name;
        if (ticketType.sectionId) {
          const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, ticketType.sectionId));
          if (sec) sectionName = sec.name;
        }
        const validDayIds = (ticketType.validEventDayIds as string[]) ?? [];
        if (validDayIds.length > 0) {
          const days = await db.select().from(eventDaysTable).where(inArray(eventDaysTable.id, validDayIds));
          validDays = days.map((d) => d.label || d.date);
        }
      }
    }

    try {
      const pdfBuffer = await generateTicketPdf({
        attendeeName: ticket.attendeeName,
        eventName: event?.name ?? "",
        eventDates: [],
        venueName: event?.venueAddress ?? "",
        venueAddress: event?.venueAddress ?? "",
        sectionName,
        ticketTypeName,
        validDays,
        qrCodeToken: ticket.qrCodeToken,
        ticketId: ticket.id,
        orderId: ticket.orderId,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tapee-ticket-${ticketId.slice(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      logger.error({ err }, "Failed to generate ticket PDF");
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

router.get(
  "/tickets/:ticketId/wallet/apple",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ticketId } = req.params as { ticketId: string };

    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, ticketId));

    if (!ticket || !ticket.qrCodeToken) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.attendeeUserId !== req.user.id) {
      const [order] = await db.select({ buyerUserId: ticketOrdersTable.buyerUserId }).from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId));
      if (!order || order.buyerUserId !== req.user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const { generateAppleWalletPass } = await import("../lib/walletPasses");

    const [event] = await db
      .select({ name: eventsTable.name, startsAt: eventsTable.startsAt, venueAddress: eventsTable.venueAddress })
      .from(eventsTable)
      .where(eq(eventsTable.id, ticket.eventId));

    const [ticketType] = ticket.ticketTypeId
      ? await db
          .select({ name: ticketTypesTable.name, sectionId: ticketTypesTable.sectionId, validEventDayIds: ticketTypesTable.validEventDayIds })
          .from(ticketTypesTable)
          .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
      : [undefined];

    let sectionName = "General";
    if (ticketType?.sectionId) {
      const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, ticketType.sectionId));
      if (sec) sectionName = sec.name;
    }

    const validDayIds = (ticketType?.validEventDayIds as string[]) ?? [];
    let validDays: string[] = [];
    if (validDayIds.length > 0) {
      const days = await db.select().from(eventDaysTable).where(inArray(eventDaysTable.id, validDayIds));
      validDays = days.map((d) => d.label || d.date);
    }

    const passBuffer = await generateAppleWalletPass({
      ticketId: ticket.id,
      eventName: event?.name ?? "Event",
      eventDate: event?.startsAt?.toISOString().split("T")[0] ?? "",
      venueName: event?.venueAddress ?? "",
      venueAddress: event?.venueAddress ?? "",
      sectionName,
      attendeeName: ticket.attendeeName,
      qrCodeToken: ticket.qrCodeToken,
      validDays,
    });

    if (!passBuffer) {
      res.status(503).json({ error: "Apple Wallet pass generation is not configured" });
      return;
    }

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="tapee-ticket-${ticket.id.slice(0, 8)}.pkpass"`,
    });
    res.send(passBuffer);
  },
);

router.get(
  "/tickets/:ticketId/wallet/google",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ticketId } = req.params as { ticketId: string };

    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, ticketId));

    if (!ticket || !ticket.qrCodeToken) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.attendeeUserId !== req.user.id) {
      const [order] = await db.select({ buyerUserId: ticketOrdersTable.buyerUserId }).from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId));
      if (!order || order.buyerUserId !== req.user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [event] = await db
      .select({ name: eventsTable.name, startsAt: eventsTable.startsAt, venueAddress: eventsTable.venueAddress })
      .from(eventsTable)
      .where(eq(eventsTable.id, ticket.eventId));

    const [ticketType] = ticket.ticketTypeId
      ? await db
          .select({ name: ticketTypesTable.name, sectionId: ticketTypesTable.sectionId, validEventDayIds: ticketTypesTable.validEventDayIds })
          .from(ticketTypesTable)
          .where(eq(ticketTypesTable.id, ticket.ticketTypeId))
      : [undefined];

    let sectionName = "General";
    if (ticketType?.sectionId) {
      const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, ticketType.sectionId));
      if (sec) sectionName = sec.name;
    }

    const validDayIds = (ticketType?.validEventDayIds as string[]) ?? [];
    let validDays: string[] = [];
    if (validDayIds.length > 0) {
      const days = await db.select().from(eventDaysTable).where(inArray(eventDaysTable.id, validDayIds));
      validDays = days.map((d) => d.label || d.date);
    }

    const saveLink = generateGoogleWalletSaveLink({
      ticketId: ticket.id,
      eventName: event?.name ?? "Event",
      eventDate: event?.startsAt?.toISOString().split("T")[0] ?? "",
      venueName: event?.venueAddress ?? "",
      venueAddress: event?.venueAddress ?? "",
      sectionName,
      attendeeName: ticket.attendeeName,
      qrCodeToken: ticket.qrCodeToken,
      validDays,
    });

    if (!saveLink) {
      res.status(503).json({ error: "Google Wallet pass generation is not configured" });
      return;
    }

    res.json({ saveLink });
  },
);

async function sendTicketWhatsApp(data: {
  ticketId: string;
  attendeeName: string;
  attendeePhone: string;
  eventId?: string;
  eventName: string;
  venueName: string;
  venueAddress: string;
  sectionName: string;
  ticketTypeName: string;
  validDays: string[];
  qrCodeToken: string;
  orderId: string;
}): Promise<void> {
  const appUrl = process.env.APP_URL || "https://attendee.tapee.app";
  const pdfToken = generatePdfToken(data.ticketId);
  const pdfUrl = `${appUrl}/api/tickets/${data.ticketId}/pdf?token=${pdfToken}`;

  const validDaysStr = data.validDays.length > 0
    ? data.validDays.join(", ")
    : "Todos los días";

  const { sendWithTemplate } = await import("../lib/templateResolver");
  const templateResult = await sendWithTemplate(
    data.attendeePhone,
    "ticket_purchased",
    [data.attendeeName, data.eventName, data.venueName, data.sectionName, data.ticketTypeName, validDaysStr],
    data.eventId,
  );

  let textSent = templateResult.sent;

  if (!templateResult.usedTemplate) {
    const message = [
      `🎟️ *Tu entrada para ${data.eventName}*`,
      ``,
      `Hola ${data.attendeeName}, tu entrada ha sido confirmada.`,
      ``,
      `📍 *Lugar:* ${data.venueName}`,
      data.venueAddress !== data.venueName ? `📌 *Dirección:* ${data.venueAddress}` : "",
      `🎫 *Sección:* ${data.sectionName}`,
      `🏷️ *Tipo:* ${data.ticketTypeName}`,
      `📅 *Días válidos:* ${validDaysStr}`,
      `🔖 *Orden:* ${data.orderId.slice(0, 8)}`,
      ``,
      `Presenta el código QR adjunto en la puerta del evento.`,
      ``,
      `— Tapee`,
    ].filter(Boolean).join("\n");

    textSent = await sendWhatsAppText(data.attendeePhone, message);
  }

  if (!textSent) {
    logger.warn({ phone: data.attendeePhone }, "WhatsApp text message failed, skipping PDF");
    return;
  }

  await sendWhatsAppDocument(
    data.attendeePhone,
    pdfUrl,
    `tapee-ticket-${data.ticketId.slice(0, 8)}.pdf`,
    `Entrada para ${data.eventName} - ${data.attendeeName}`,
  );
}

export async function processTicketOrderPayment(orderId: string, wompiTransactionId: string, buyerLocale?: string) {
  const confirmed = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ticketOrdersTable)
      .where(and(eq(ticketOrdersTable.id, orderId), eq(ticketOrdersTable.paymentStatus, "pending")));

    if (!order) return false;

    await tx
      .update(ticketOrdersTable)
      .set({ paymentStatus: "confirmed", updatedAt: new Date() })
      .where(eq(ticketOrdersTable.id, orderId));

    await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "success", updatedAt: new Date() })
      .where(eq(wompiPaymentIntentsTable.ticketOrderId, orderId));

    return true;
  });

  if (!confirmed) return;

  const [order] = await db
    .select()
    .from(ticketOrdersTable)
    .where(eq(ticketOrdersTable.id, orderId));

  if (!order) return;

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId));

  const existingTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.orderId, orderId));

  for (const ticket of existingTickets) {
    const qrCodeToken = generateTicketQrToken(ticket.id, ticket.attendeeUserId);
    await db.update(ticketsTable).set({ qrCodeToken, updatedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));

    if (event) {
      const [ticketType] = ticket.ticketTypeId
        ? await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId))
        : [undefined];
      const validDayIds = (ticketType?.validEventDayIds as string[]) ?? [];
      let validDays: string[] = [];
      if (validDayIds.length > 0) {
        const days = await db.select().from(eventDaysTable).where(inArray(eventDaysTable.id, validDayIds));
        validDays = days.map((d) => d.label || d.date);
      }

      let sectionName = "General";
      if (ticketType?.sectionId) {
        const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, ticketType.sectionId));
        if (sec) sectionName = sec.name;
      }

      const hasAccount = !!ticket.attendeeUserId;
      const attendeeLocale = buyerLocale ?? (event.currencyCode === "USD" ? "en" : "es");

      void sendTicketConfirmationEmail({
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        eventName: event.name,
        eventDates: [],
        venueName: event.venueAddress ?? "",
        venueAddress: event.venueAddress ?? "",
        sectionName,
        ticketTypeName: ticketType?.name ?? "",
        validDays,
        qrCodeToken,
        ticketId: ticket.id,
        orderId,
        locale: attendeeLocale,
        hasAccount,
      }).catch((err) => logger.error(`Failed to send ticket email to ${ticket.attendeeEmail}: ${err}`));

      if (ticket.attendeePhone && isWhatsAppConfigured()) {
        void sendTicketWhatsApp({
          ticketId: ticket.id,
          attendeeName: ticket.attendeeName,
          attendeePhone: ticket.attendeePhone,
          eventId: order.eventId,
          eventName: event.name,
          venueName: event.venueAddress ?? "",
          venueAddress: event.venueAddress ?? "",
          sectionName,
          ticketTypeName: ticketType?.name ?? "",
          validDays,
          qrCodeToken,
          orderId,
        }).catch((err) => logger.error(`Failed to send WhatsApp ticket to ${ticket.attendeePhone}: ${err}`));
      }

      if (!ticket.attendeeUserId) {
        void sendTicketInvitationEmail({
          attendeeName: ticket.attendeeName,
          attendeeEmail: ticket.attendeeEmail,
          eventName: event.name,
          buyerName: order.buyerName ?? "Someone",
          locale: attendeeLocale,
        }).catch((err) => logger.error(`Failed to send invitation email to ${ticket.attendeeEmail}: ${err}`));
      }
    }
  }
}

async function releaseUnitsForOrder(orderId: string) {
  const units = await db
    .select({ id: ticketTypeUnitsTable.id })
    .from(ticketTypeUnitsTable)
    .where(eq(ticketTypeUnitsTable.orderId, orderId));

  for (const u of units) {
    await db
      .update(ticketTypeUnitsTable)
      .set({ status: "available", orderId: null })
      .where(eq(ticketTypeUnitsTable.id, u.id));
  }
}

async function rollbackOrderInventory(
  orderId: string,
  quantityByType: Map<string, number>,
  ticketTypeMap: Map<string, { id: string; isNumberedUnits: boolean | null; name: string }>,
  unitSelMap: Map<string, string>,
) {
  await db
    .update(ticketOrdersTable)
    .set({ paymentStatus: "cancelled", updatedAt: new Date() })
    .where(eq(ticketOrdersTable.id, orderId));

  for (const [typeId, qty] of quantityByType) {
    const tt = ticketTypeMap.get(typeId);
    if (tt?.isNumberedUnits) {
      await db
        .update(ticketTypesTable)
        .set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - 1, 0)`, updatedAt: new Date() })
        .where(eq(ticketTypesTable.id, typeId));
    } else {
      await db
        .update(ticketTypesTable)
        .set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${qty}, 0)`, updatedAt: new Date() })
        .where(eq(ticketTypesTable.id, typeId));
    }
  }

  for (const [, unitId] of unitSelMap) {
    await db
      .update(ticketTypeUnitsTable)
      .set({ status: "available", orderId: null })
      .where(eq(ticketTypeUnitsTable.id, unitId));
  }
}

async function cancelTicketOrder(orderId: string) {
  const [order] = await db
    .select()
    .from(ticketOrdersTable)
    .where(eq(ticketOrdersTable.id, orderId));

  if (!order || order.paymentStatus !== "pending") return;

  await db
    .update(ticketOrdersTable)
    .set({ paymentStatus: "cancelled", updatedAt: new Date() })
    .where(eq(ticketOrdersTable.id, orderId));

  await db
    .update(wompiPaymentIntentsTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(wompiPaymentIntentsTable.ticketOrderId, orderId));

  await db
    .update(ticketsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(ticketsTable.orderId, orderId));

  const tickets = await db
    .select({ ticketTypeId: ticketsTable.ticketTypeId })
    .from(ticketsTable)
    .where(eq(ticketsTable.orderId, orderId));

  const ticketTypeIds = [...new Set(tickets.map((t) => t.ticketTypeId))];
  const ttRows = ticketTypeIds.length > 0
    ? await db.select().from(ticketTypesTable).where(inArray(ticketTypesTable.id, ticketTypeIds))
    : [];
  const ttMap = new Map(ttRows.map((tt) => [tt.id, tt]));

  const quantityByType = new Map<string, number>();
  for (const t of tickets) {
    quantityByType.set(t.ticketTypeId, (quantityByType.get(t.ticketTypeId) || 0) + 1);
  }

  for (const [typeId, qty] of quantityByType) {
    const tt = ttMap.get(typeId);
    if (tt?.isNumberedUnits) {
      await db
        .update(ticketTypesTable)
        .set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - 1, 0)`, updatedAt: new Date() })
        .where(eq(ticketTypesTable.id, typeId));
    } else {
      await db
        .update(ticketTypesTable)
        .set({ soldCount: sql`GREATEST(${ticketTypesTable.soldCount} - ${qty}, 0)`, updatedAt: new Date() })
        .where(eq(ticketTypesTable.id, typeId));
    }
  }

  await releaseUnitsForOrder(orderId);
}

router.post(
  "/tickets/claim",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user || !user.email) {
      res.status(400).json({ error: "User email not found" });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ error: "Email must be verified before claiming tickets" });
      return;
    }

    const normalizedEmail = user.email.toLowerCase().trim();

    const unlinkedTickets = await db
      .select({ id: ticketsTable.id, orderId: ticketsTable.orderId })
      .from(ticketsTable)
      .where(and(
        eq(ticketsTable.attendeeEmail, normalizedEmail),
        sql`${ticketsTable.attendeeUserId} IS NULL`,
        eq(ticketsTable.status, "valid"),
      ));

    if (unlinkedTickets.length === 0) {
      res.json({ claimed: 0 });
      return;
    }

    const ticketIds = unlinkedTickets.map((t) => t.id);
    await db
      .update(ticketsTable)
      .set({ attendeeUserId: req.user.id, updatedAt: new Date() })
      .where(inArray(ticketsTable.id, ticketIds));

    res.json({ claimed: ticketIds.length, ticketIds });
  },
);

export { cancelTicketOrder };

export default router;

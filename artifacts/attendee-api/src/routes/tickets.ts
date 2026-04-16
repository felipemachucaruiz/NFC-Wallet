import { Router, type IRouter, type Request, type Response } from "express";
import { db, eventsTable, eventDaysTable, venuesTable, venueSectionsTable, ticketTypesTable, ticketTypeUnitsTable, ticketOrdersTable, ticketsTable, wompiPaymentIntentsTable, usersTable, pendingWhatsappDocumentsTable, savedCardsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import crypto from "crypto";
import { generateTicketQrToken } from "../lib/ticketQr";
import { sendTicketConfirmationEmail, sendTicketInvitationEmail, sendAccountActivationEmail, sendTicketTransferEmail } from "../lib/ticketEmails";
import { findOrCreateAttendeeAccount, generateActivationToken, buildActivationUrl } from "../lib/attendeeAccounts";
import { generateGoogleWalletSaveLink } from "../lib/walletPasses";
import { verifyTurnstileToken } from "../lib/turnstile";
import { generateTicketPdf, generateMultiTicketPdf, type TicketPdfData } from "../lib/ticketPdf";
import { sendWhatsAppDocument, sendWhatsAppText, isWhatsAppConfigured } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import { captureError } from "../lib/captureError";

const router: IRouter = Router();

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || "";

function computeWompiIntegrity(reference: string, amountCentavos: number, currency: string): string {
  const payload = `${reference}${amountCentavos}${currency}${WOMPI_INTEGRITY_SECRET}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

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

async function fetchWompiTokens(): Promise<{ acceptanceToken: string; personalAuthToken: string }> {
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Wompi merchants/${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    data: {
      presigned_acceptance: { acceptance_token: unknown };
      presigned_personal_data_auth: { acceptance_token: unknown };
    };
  };
  const acceptanceToken = data.data?.presigned_acceptance?.acceptance_token;
  const personalAuthToken = data.data?.presigned_personal_data_auth?.acceptance_token;
  if (typeof acceptanceToken !== "string" || !acceptanceToken) {
    throw new Error(`Wompi presigned_acceptance.acceptance_token is missing or not a string (got ${typeof acceptanceToken})`);
  }
  if (typeof personalAuthToken !== "string" || !personalAuthToken) {
    throw new Error(`Wompi presigned_personal_data_auth.acceptance_token is missing or not a string (got ${typeof personalAuthToken})`);
  }
  return { acceptanceToken, personalAuthToken };
}

const attendeeDataSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  dateOfBirth: z.string().max(10).optional(),
  sex: z.enum(["male", "female"]).optional(),
  idDocument: z.string().max(50).optional(),
  ticketTypeId: z.string().min(1),
});

const createOrderSchema = z.object({
  eventId: z.string().min(1),
  attendees: z.array(attendeeDataSchema).min(1).max(50),
  unitSelections: z.array(z.object({
    ticketTypeId: z.string().min(1),
    unitId: z.string().min(1),
  })).optional(),
  paymentMethod: z.enum(["card", "nequi", "pse", "bancolombia_transfer", "free"]),
  cardToken: z.string().optional(),
  savedCardId: z.string().optional(),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
  userLegalIdType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  userLegalId: z.string().max(20).optional(),
  installments: z.number().int().min(1).max(36).optional(),
  turnstileToken: z.string().optional(),
});

router.post(
  "/tickets/purchase",
  async (req: Request, res: Response) => {
    try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { eventId, attendees, unitSelections, paymentMethod, savedCardId, phoneNumber, bankCode, userLegalIdType, userLegalId, installments, turnstileToken } = parsed.data;
    let { cardToken } = parsed.data;

    if (!req.isAuthenticated()) {
      if (!turnstileToken) {
        res.status(400).json({ error: "Captcha verification required" });
        return;
      }
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress;
      const valid = await verifyTurnstileToken(turnstileToken, clientIp || undefined);
      if (!valid) {
        res.status(403).json({ error: "Captcha verification failed. Please try again." });
        return;
      }
    }

    let buyerUserId: string;
    let customerEmail: string;
    let buyerName: string;

    if (req.isAuthenticated()) {
      buyerUserId = req.user.id;
      const [userRecord] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
      customerEmail = userRecord?.email || `attendee_${req.user.id}@evento.local`;
      buyerName = userRecord ? `${userRecord.firstName || ""} ${userRecord.lastName || ""}`.trim() : "Attendee";
    } else {
      const firstAttendee = attendees[0];
      const normalizedEmail = firstAttendee.email.toLowerCase().trim();
      const { userId } = await findOrCreateAttendeeAccount(
        normalizedEmail,
        firstAttendee.name,
        firstAttendee.phone,
      );
      buyerUserId = userId;
      customerEmail = normalizedEmail;
      buyerName = firstAttendee.name;
    }

    if (paymentMethod !== "free") {
      if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
        res.status(503).json({ error: "Payment gateway not configured" });
        return;
      }
      if (paymentMethod === "card") {
        if (savedCardId && req.isAuthenticated()) {
          const [savedCard] = await db
            .select({ wompiToken: savedCardsTable.wompiToken })
            .from(savedCardsTable)
            .where(and(eq(savedCardsTable.id, savedCardId), eq(savedCardsTable.userId, req.user!.id)));
          if (!savedCard) {
            res.status(404).json({ error: "Saved card not found" });
            return;
          }
          cardToken = savedCard.wompiToken;
        }
        if (!cardToken) {
          res.status(400).json({ error: "cardToken or savedCardId is required for card payments" });
          return;
        }
      }
      if (paymentMethod === "nequi" && !phoneNumber) {
        res.status(400).json({ error: "phoneNumber is required for Nequi payments" });
        return;
      }
      if (paymentMethod === "pse" && (!bankCode || !userLegalId)) {
        res.status(400).json({ error: "bankCode and userLegalId are required for PSE payments" });
        return;
      }
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
      if (tt.isNumberedUnits) {
        // Numbered-unit types represent a single purchasable unit (e.g. a table).
        // Attendee count must equal ticketsPerUnit exactly so pricing is unambiguous.
        const expectedQty = Number(tt.ticketsPerUnit) || 1;
        if (qty !== expectedQty) {
          res.status(400).json({
            error: `${tt.name} requires exactly ${expectedQty} attendee(s) per unit`,
          });
          return;
        }
      } else {
        if (tt.quantity - tt.soldCount < qty) {
          res.status(409).json({ error: `Not enough tickets available for ${tt.name}. Available: ${tt.quantity - tt.soldCount}` });
          return;
        }
      }
    }

    let totalAmount = 0;
    for (const [typeId, qty] of quantityByType) {
      const tt = ticketTypeMap.get(typeId)!;
      // Subtotal per type: numbered units have a single per-unit price; non-numbered multiply by quantity
      const subtotal = tt.isNumberedUnits ? Number(tt.price) : Number(tt.price) * qty;
      const serviceFee = Number(tt.serviceFee ?? 0);
      // Mirror storefront (TicketSelector.tsx): percentage rounds on aggregate subtotal;
      // fixed fee applies once per unit for numbered types, once per ticket for non-numbered
      const feeAmount =
        tt.serviceFeeType === "percentage"
          ? Math.round(subtotal * serviceFee / 100)
          : serviceFee * (tt.isNumberedUnits ? 1 : qty);
      totalAmount += subtotal + feeAmount;
    }

    if (paymentMethod === "free" && totalAmount !== 0) {
      res.status(400).json({ error: "Free payment method is only allowed for free tickets (total = 0)" });
      return;
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
          buyerUserId,
          buyerEmail: customerEmail,
          buyerName,
          totalAmount,
          ticketCount: attendees.length,
          paymentStatus: "pending",
          paymentMethod,
          attendeesJson: attendees as unknown as Record<string, unknown>[],
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

    const buyerPhone = attendees[0]?.phone;
    if (buyerPhone && req.isAuthenticated()) {
      try {
        const [currentUser] = await db
          .select({ phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.id, buyerUserId));
        if (currentUser && !currentUser.phone) {
          const [phoneOwner] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.phone, buyerPhone));
          if (!phoneOwner) {
            await db
              .update(usersTable)
              .set({ phone: buyerPhone, updatedAt: new Date() })
              .where(eq(usersTable.id, buyerUserId));
            logger.info({ userId: buyerUserId }, "Saved phone number from ticket purchase to user profile");
          }
        }
      } catch (err) {
        logger.error({ err }, "Failed to save phone to user profile");
      }
    }

    if (paymentMethod === "free") {
      for (const attendee of attendees) {
        const normalizedEmail = attendee.email.toLowerCase().trim();
        const { userId: attendeeUserId } = await findOrCreateAttendeeAccount(
          normalizedEmail,
          attendee.name,
          attendee.phone,
        );

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
            attendeeDateOfBirth: attendee.dateOfBirth ?? null,
            attendeeSex: attendee.sex ?? null,
            attendeeIdDocument: attendee.idDocument ?? null,
            attendeeUserId,
            status: "valid",
          });
      }

      await db
        .update(ticketOrdersTable)
        .set({ paymentStatus: "confirmed", updatedAt: new Date() })
        .where(eq(ticketOrdersTable.id, order.id));

      const freeTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.orderId, order.id));
      const [freeEvent] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
      for (const ticket of freeTickets) {
        const qrCodeToken = generateTicketQrToken(ticket.id, ticket.attendeeUserId);
        await db.update(ticketsTable).set({ qrCodeToken, updatedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));
      }

      deliverFreeTicketNotifications(order.id, eventId, req.headers["accept-language"]).catch((err) => {
        logger.error({ err, orderId: order.id }, "Error delivering free ticket notifications");
      });

      res.status(201).json({
        orderId: order.id,
        totalAmount: 0,
        ticketCount: attendees.length,
        paymentMethod: "free",
        wompiTransactionId: null,
        redirectUrl: null,
        status: "confirmed",
      });
      return;
    }

    const reference = `ticket_${order.id}_${Date.now()}`;
    let wompiTransactionId: string | undefined;
    let redirectUrl: string | undefined;

    try {
      const { acceptanceToken, personalAuthToken } = await fetchWompiTokens();
      const amountCentavos = Math.round(totalAmount * 100);

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
          acceptance_personal_auth_token: personalAuthToken,
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
          acceptance_personal_auth_token: personalAuthToken,
        };
      } else if (paymentMethod === "bancolombia_transfer") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "BANCOLOMBIA_TRANSFER",
            user_type: "PERSON",
            payment_description: `Entrada ${event.name}`,
          },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
          redirect_url: `${process.env.APP_URL ?? "https://tickets.tapee.app"}/payment-return`,
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
          acceptance_personal_auth_token: personalAuthToken,
          redirect_url: `${process.env.APP_URL ?? "https://tickets.tapee.app"}/payment-return`,
        };
      }

      if (WOMPI_INTEGRITY_SECRET) {
        wompiBody.signature = computeWompiIntegrity(reference, amountCentavos, "COP");
      }

      const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        },
        body: JSON.stringify(wompiBody),
      });

      const wompiData = await wompiRes.json() as { data?: { id: string; payment_method?: { extra?: { async_payment_url?: string } } }; error?: { type?: string; messages?: string[] | Record<string, string[]> } };
      if (!wompiRes.ok || !wompiData.data) {
        logger.error({ wompiData, amountCentavos, paymentMethod, reference }, "Wompi ticket payment error");
        await rollbackOrderInventory(order.id, quantityByType, ticketTypeMap, unitSelMap);
        const msgs = wompiData.error?.messages;
        let wompiMsg = "";
        if (msgs) {
          if (Array.isArray(msgs)) {
            wompiMsg = msgs.join("; ");
          } else {
            wompiMsg = Object.entries(msgs)
              .map(([field, val]) => {
                const errs = Array.isArray(val) ? val : typeof val === "object" && val !== null ? Object.values(val as Record<string, string[]>).flat() : [String(val)];
                return `${field}: ${errs.join(", ")}`;
              })
              .join("; ");
          }
        } else {
          wompiMsg = wompiData.error?.type || "";
        }
        res.status(502).json({ error: wompiMsg ? `Error del sistema de pago: ${wompiMsg}` : "Failed to initiate payment. Try again." });
        return;
      }

      wompiTransactionId = wompiData.data.id;
      redirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, errMsg, wompiBaseUrl: WOMPI_BASE_URL }, "Wompi API error during ticket purchase");
      captureError(err, { route: "tickets/purchase/wompi-initiate", extra: { orderId: order.id } });
      await rollbackOrderInventory(order.id, quantityByType, ticketTypeMap, unitSelMap);
      res.status(502).json({ error: `Payment gateway error: ${errMsg}` });
      return;
    }

    try {
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
          performedByUserId: buyerUserId,
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
            attendeeDateOfBirth: attendee.dateOfBirth ?? null,
            attendeeSex: attendee.sex ?? null,
            attendeeIdDocument: attendee.idDocument ?? null,
            attendeeUserId: attendeeUserId,
            status: "valid",
          });
      }
    } catch (postWompiErr) {
      logger.error(
        { postWompiErr, orderId: order.id, wompiTransactionId, eventId },
        "Post-Wompi DB operation failed — payment was captured by Wompi but order records are incomplete. Manual recovery required.",
      );
      captureError(postWompiErr, {
        route: "tickets/purchase/post-wompi-db",
        tags: { severity: "critical" },
        extra: { orderId: order.id, wompiTransactionId, eventId },
      });
      res.status(201).json({
        orderId: order.id,
        totalAmount,
        ticketCount: attendees.length,
        paymentMethod,
        wompiTransactionId,
        redirectUrl: redirectUrl ?? null,
        status: "pending",
        warning: "Tu pago fue procesado pero hubo un error al confirmar tu orden. Por favor revisa el estado de tu orden.",
      });
      return;
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
    } catch (err) {
      logger.error({ err }, "Unhandled error in ticket purchase");
      captureError(err, { route: "tickets/purchase/unhandled" });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error processing purchase" });
      }
    }
  },
);

router.get(
  "/tickets/orders/:orderId/status",
  async (req: Request, res: Response) => {
    const { orderId } = req.params as { orderId: string };

    const [order] = await db
      .select()
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.id, orderId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (req.isAuthenticated() && order.buyerUserId !== req.user.id && req.user.role !== "admin") {
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
        attendeeUserId: ticketsTable.attendeeUserId,
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
        // Auto-generate QR token if missing (e.g. tickets created before this field was added
        // or via admin panel without going through the normal purchase flow).
        let qrCodeToken = ticket.qrCodeToken;
        if (!qrCodeToken) {
          qrCodeToken = generateTicketQrToken(ticket.id, ticket.attendeeUserId);
          await db
            .update(ticketsTable)
            .set({ qrCodeToken, updatedAt: new Date() })
            .where(eq(ticketsTable.id, ticket.id));
        }

        const [event] = await db
          .select({ name: eventsTable.name, startsAt: eventsTable.startsAt, endsAt: eventsTable.endsAt, flyerImageUrl: eventsTable.flyerImageUrl, coverImageUrl: eventsTable.coverImageUrl, venueAddress: eventsTable.venueAddress, currencyCode: eventsTable.currencyCode })
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
          qrCodeToken,
          eventName: event?.name ?? null,
          eventStartsAt: event?.startsAt ?? null,
          eventEndsAt: event?.endsAt ?? null,
          eventCoverImage: event?.flyerImageUrl ?? event?.coverImageUrl ?? null,
          venueAddress: event?.venueAddress ?? null,
          ticketTypeName: ticketType?.name ?? null,
          validEventDayIds: ticketType?.validEventDayIds ?? [],
          currencyCode: event?.currencyCode ?? "COP",
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

function generatePdfToken(id: string): string {
  if (!PDF_TOKEN_SECRET) throw new Error("PDF_TOKEN_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${id}:${exp}`;
  const sig = crypto.createHmac("sha256", PDF_TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyPdfToken(token: string, expectedId: string): boolean {
  if (!PDF_TOKEN_SECRET) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 3) return false;
    const sig = parts[parts.length - 1];
    const expStr = parts[parts.length - 2];
    const tid = parts.slice(0, parts.length - 2).join(":");
    if (tid !== expectedId) return false;
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
    let ticketPrice = 0;

    if (ticket.ticketTypeId) {
      const [ticketType] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
      if (ticketType) {
        ticketTypeName = ticketType.name;
        ticketPrice = ticketType.price ? Number(ticketType.price) : 0;
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

    const eventDateStr = event?.startsAt
      ? new Date(event.startsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" })
      : null;

    const apiBase = process.env.APP_URL || "https://attendee.tapee.app";
    const rawFlyer = (event as any)?.flyerImageUrl ?? null;
    const flyerImageUrl = rawFlyer && !rawFlyer.startsWith("http") ? `https://prod.tapee.app${rawFlyer}` : rawFlyer;

    try {
      const pdfBuffer = await generateTicketPdf({
        attendeeName: ticket.attendeeName,
        eventName: event?.name ?? "",
        eventDates: eventDateStr ? [eventDateStr] : [],
        venueName: event?.venueAddress ?? "",
        venueAddress: event?.venueAddress ?? "",
        sectionName,
        ticketTypeName,
        price: ticketPrice,
        currencyCode: event?.currencyCode ?? "COP",
        validDays,
        qrCodeToken: ticket.qrCodeToken,
        ticketId: ticket.id,
        orderId: ticket.orderId,
        purchasedAt: ticket.createdAt,
        flyerImageUrl,
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
  "/orders/:orderId/pdf",
  async (req: Request, res: Response) => {
    const { orderId } = req.params as { orderId: string };
    const token = req.query.token as string;

    if (!token || !verifyPdfToken(token, `order:${orderId}`)) {
      res.status(403).json({ error: "Invalid or expired token" });
      return;
    }

    const [order] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId));
    const orderTickets = await db.select().from(ticketsTable).where(and(eq(ticketsTable.orderId, orderId), eq(ticketsTable.status, "valid")));

    if (orderTickets.length === 0) {
      res.status(404).json({ error: "No valid tickets in this order" });
      return;
    }

    const rawFlyer = (event as any)?.flyerImageUrl ?? null;
    const flyerImageUrl = rawFlyer && !rawFlyer.startsWith("http") ? `https://prod.tapee.app${rawFlyer}` : rawFlyer;

    try {
      const ticketDataList: TicketPdfData[] = [];

      const orderEventDateStr = event?.startsAt
        ? new Date(event.startsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" })
        : null;

      for (const ticket of orderTickets) {
        let sectionName = "General";
        let ticketTypeName = "";
        let validDays: string[] = [];
        let ticketPrice = 0;

        if (ticket.ticketTypeId) {
          const [ticketType] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
          if (ticketType) {
            ticketTypeName = ticketType.name;
            ticketPrice = ticketType.price ? Number(ticketType.price) : 0;
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

        ticketDataList.push({
          attendeeName: ticket.attendeeName,
          eventName: event?.name ?? "",
          eventDates: orderEventDateStr ? [orderEventDateStr] : [],
          venueName: event?.venueAddress ?? "",
          venueAddress: event?.venueAddress ?? "",
          sectionName,
          ticketTypeName,
          validDays,
          qrCodeToken: ticket.qrCodeToken ?? "",
          ticketId: ticket.id,
          orderId,
          purchasedAt: ticket.createdAt,
          flyerImageUrl,
          price: ticketPrice,
          currencyCode: event?.currencyCode ?? "COP",
        });
      }

      const pdfBuffer = await generateMultiTicketPdf(ticketDataList);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tapee-tickets-${orderId.slice(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      logger.error({ err }, "Failed to generate order PDF");
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
      .select({ name: eventsTable.name, startsAt: eventsTable.startsAt, venueAddress: eventsTable.venueAddress, flyerImageUrl: eventsTable.flyerImageUrl })
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
      flyerUrl: event?.flyerImageUrl ?? null,
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

router.post(
  "/tickets/resend-whatsapp/:orderId",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;

    const [order] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, orderId));
    if (!order || order.paymentStatus !== "confirmed") {
      res.status(404).json({ error: "Confirmed order not found" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const orderTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.orderId, orderId));
    const eventDaysList = await db.select().from(eventDaysTable).where(eq(eventDaysTable.eventId, order.eventId));

    let sent = 0;
    let failed = 0;
    const whatsAppPhones = new Map<string, { attendeeName: string; ticketCount: number }>();

    for (const ticket of orderTickets) {
      if (!ticket.attendeePhone) continue;

      const ticketType = ticket.ticketTypeId
        ? await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId)).then(r => r[0])
        : undefined;
      const section = ticketType?.sectionId
        ? await db.select().from(venueSectionsTable).where(eq(venueSectionsTable.id, ticketType.sectionId)).then(r => r[0])
        : null;

      const validDays = eventDaysList.map((d) => d.label || d.date);

      try {
        const ok = await sendTicketWhatsApp({
          ticketId: ticket.id,
          attendeeName: ticket.attendeeName,
          attendeePhone: ticket.attendeePhone,
          eventId: order.eventId,
          eventName: event.name,
          venueName: event.venueAddress ?? "",
          venueAddress: event.venueAddress ?? "",
          sectionName: section?.name ?? "General",
          ticketTypeName: ticketType?.name ?? "",
          validDays: validDays as string[],
          qrCodeToken: ticket.qrCodeToken ?? "",
          orderId,
        });
        if (ok) {
          sent++;
          const existing = whatsAppPhones.get(ticket.attendeePhone);
          if (existing) {
            existing.ticketCount += 1;
          } else {
            whatsAppPhones.set(ticket.attendeePhone, { attendeeName: ticket.attendeeName, ticketCount: 1 });
          }
        } else {
          failed++;
        }
      } catch (err) {
        logger.error({ err, ticketId: ticket.id }, "Failed to resend WhatsApp for ticket");
        failed++;
      }
    }

    if (whatsAppPhones.size > 0) {
      void queueOrderTicketDocuments(orderId, event.name, whatsAppPhones)
        .catch((err) => logger.error({ err, orderId }, "Failed to send resend ticket documents"));
    }

    res.json({ sent, failed, total: orderTickets.length });
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
}): Promise<boolean> {
  const validDaysStr = data.validDays.length > 0
    ? data.validDays.join(", ")
    : "Todos los dias";

  const { sendWithTemplate } = await import("../lib/templateResolver");
  const context: Record<string, string> = {
    attendeeName: data.attendeeName,
    eventName: data.eventName,
    venueName: data.venueName,
    venueAddress: data.venueAddress,
    sectionName: data.sectionName,
    ticketTypeName: data.ticketTypeName,
    validDays: validDaysStr,
    orderId: data.orderId.slice(0, 8),
  };
  const logContext = {
    triggerType: "ticket_purchased",
    orderId: data.orderId,
    ticketId: data.ticketId,
    eventId: data.eventId,
    attendeeName: data.attendeeName,
  };
  const templateResult = await sendWithTemplate(
    data.attendeePhone,
    "ticket_purchased",
    [data.attendeeName, data.eventName, data.venueName, data.sectionName, data.ticketTypeName, validDaysStr],
    data.eventId,
    context,
    logContext,
  );

  let textSent = templateResult.sent;

  if (!templateResult.usedTemplate) {
    const message = [
      `*Tu entrada para ${data.eventName}*`,
      ``,
      `Hola ${data.attendeeName}, tu entrada ha sido confirmada.`,
      ``,
      `*Lugar:* ${data.venueName}`,
      data.venueAddress !== data.venueName ? `*Direccion:* ${data.venueAddress}` : "",
      `*Seccion:* ${data.sectionName}`,
      `*Tipo:* ${data.ticketTypeName}`,
      `*Dias validos:* ${validDaysStr}`,
      `*Orden:* ${data.orderId.slice(0, 8)}`,
      ``,
      `Presenta el codigo QR adjunto en la puerta del evento.`,
      ``,
      `-- Tapee`,
    ].filter(Boolean).join("\n");

    textSent = await sendWhatsAppText(data.attendeePhone, message);
  }

  return textSent;
}

async function queueOrderTicketDocuments(
  orderId: string,
  eventName: string,
  ticketsByPhone: Map<string, { attendeeName: string; ticketCount: number }>,
): Promise<void> {
  for (const [phone, info] of ticketsByPhone) {
    const filename = info.ticketCount === 1
      ? `tapee-ticket-${orderId.slice(0, 8)}.pdf`
      : `tapee-tickets-${orderId.slice(0, 8)}.pdf`;

    try {
      await db.insert(pendingWhatsappDocumentsTable).values({
        phone: normalizePhone(phone),
        orderId,
        eventName,
        attendeeName: info.attendeeName,
        ticketCount: info.ticketCount,
        pdfUrl: "",
        filename,
      });
      logger.info({ phone, orderId }, "Queued pending WhatsApp document for user reply");
    } catch (err) {
      logger.error({ err, phone, orderId }, "Failed to queue pending WhatsApp document");
    }
  }
}

export function buildOrderPdfUrl(orderId: string): string {
  const appUrl = (process.env.APP_URL || "https://attendee.tapee.app").replace(/\/$/, "");
  const pdfToken = generatePdfToken(`order:${orderId}`);
  return `${appUrl}/attendee-api/api/orders/${orderId}/pdf?token=${pdfToken}`;
}

export async function generateOrderPdfBuffer(orderId: string): Promise<Buffer | null> {
  try {
    const [order] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, orderId));
    if (!order) return null;

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId));
    const orderTickets = await db.select().from(ticketsTable).where(and(eq(ticketsTable.orderId, orderId), eq(ticketsTable.status, "valid")));

    if (orderTickets.length === 0) return null;

    const rawFlyer = (event as any)?.flyerImageUrl ?? null;
    const flyerImageUrl = rawFlyer && !rawFlyer.startsWith("http") ? `https://prod.tapee.app${rawFlyer}` : rawFlyer;

    const ticketDataList: TicketPdfData[] = [];

    const bufEventDateStr = event?.startsAt
      ? new Date(event.startsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" })
      : null;

    for (const ticket of orderTickets) {
      let sectionName = "General";
      let ticketTypeName = "";
      let validDays: string[] = [];
      let ticketPrice = 0;

      if (ticket.ticketTypeId) {
        const [ticketType] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
        if (ticketType) {
          ticketTypeName = ticketType.name;
          ticketPrice = ticketType.price ? Number(ticketType.price) : 0;
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

      ticketDataList.push({
        attendeeName: ticket.attendeeName,
        eventName: event?.name ?? "",
        eventDates: bufEventDateStr ? [bufEventDateStr] : [],
        venueName: event?.venueAddress ?? "",
        venueAddress: event?.venueAddress ?? "",
        sectionName,
        ticketTypeName,
        validDays,
        qrCodeToken: ticket.qrCodeToken ?? "",
        ticketId: ticket.id,
        orderId,
        purchasedAt: ticket.createdAt,
        flyerImageUrl,
        price: ticketPrice,
        currencyCode: event?.currencyCode ?? "COP",
      });
    }

    return await generateMultiTicketPdf(ticketDataList);
  } catch (err) {
    logger.error({ err, orderId }, "Failed to generate order PDF buffer");
    return null;
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (/^\d{10}$/.test(cleaned)) cleaned = `57${cleaned}`;
  return cleaned;
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

  if (existingTickets.length === 0 && order.attendeesJson) {
    try {
      const storedAttendees = order.attendeesJson as Array<{
        name: string;
        email: string;
        phone?: string;
        dateOfBirth?: string;
        sex?: string;
        idDocument?: string;
        ticketTypeId: string;
      }>;
      for (const attendee of storedAttendees) {
        const normalizedEmail = attendee.email.toLowerCase().trim();
        const { userId: attendeeUserId } = await findOrCreateAttendeeAccount(
          normalizedEmail,
          attendee.name,
          attendee.phone,
        );
        const [ticket] = await db
          .insert(ticketsTable)
          .values({
            orderId: order.id,
            ticketTypeId: attendee.ticketTypeId,
            eventId: order.eventId,
            unitId: null,
            attendeeName: attendee.name,
            attendeeEmail: normalizedEmail,
            attendeePhone: attendee.phone ?? null,
            attendeeDateOfBirth: attendee.dateOfBirth ?? null,
            attendeeSex: attendee.sex ?? null,
            attendeeIdDocument: attendee.idDocument ?? null,
            attendeeUserId: attendeeUserId,
            status: "valid",
          })
          .returning();
        existingTickets.push(ticket);
      }
      logger.info({ orderId, ticketCount: existingTickets.length }, "Recovered tickets from attendeesJson after partial checkout failure");
    } catch (recoveryErr) {
      logger.error({ recoveryErr, orderId }, "Failed to recover tickets from attendeesJson");
    }
  }

  const whatsAppPhones = new Map<string, { attendeeName: string; ticketCount: number }>();

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

      const attendeeLocale = buyerLocale ?? (event.currencyCode === "USD" ? "en" : "es");

      void sendTicketConfirmationEmail({
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        eventName: event.name,
        eventDates: [],
        eventStartsAt: event.startsAt ? new Date(event.startsAt).toISOString() : undefined,
        flyerImageUrl: event.flyerImageUrl ?? event.coverImageUrl ?? undefined,
        venueName: event.venueAddress ?? "",
        venueAddress: event.venueAddress ?? "",
        sectionName,
        ticketTypeName: ticketType?.name ?? "",
        validDays,
        qrCodeToken,
        ticketId: ticket.id,
        orderId,
        locale: attendeeLocale,
        hasAccount: true,
        price: ticketType?.price ? Number(ticketType.price) : undefined,
        currencyCode: event.currencyCode ?? "COP",
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

        const existing = whatsAppPhones.get(ticket.attendeePhone);
        if (existing) {
          existing.ticketCount += 1;
        } else {
          whatsAppPhones.set(ticket.attendeePhone, { attendeeName: ticket.attendeeName, ticketCount: 1 });
        }
      }

      if (ticket.attendeeUserId) {
        const [attendeeUser] = await db
          .select({ passwordHash: usersTable.passwordHash })
          .from(usersTable)
          .where(eq(usersTable.id, ticket.attendeeUserId));
        if (attendeeUser && !attendeeUser.passwordHash) {
          void (async () => {
            try {
              const activationToken = await generateActivationToken(ticket.attendeeUserId!);
              const activationUrl = buildActivationUrl(activationToken);
              await sendAccountActivationEmail({
                attendeeName: ticket.attendeeName,
                attendeeEmail: ticket.attendeeEmail,
                eventName: event.name,
                buyerName: order.buyerName ?? "Someone",
                activationUrl,
                locale: attendeeLocale,
              });
            } catch (err) {
              logger.error({ err }, `Failed to send activation email to ${ticket.attendeeEmail}`);
            }
          })();
        }
      }
    }
  }

  if (whatsAppPhones.size > 0 && event) {
    void queueOrderTicketDocuments(orderId, event.name, whatsAppPhones)
      .catch((err) => logger.error({ err, orderId }, "Failed to send order ticket documents"));
  }
}

async function deliverFreeTicketNotifications(orderId: string, eventId: string, buyerLocale?: string) {
  const [order] = await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, orderId));
  if (!order) return;
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!event) return;

  const tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.orderId, orderId));

  const whatsAppPhones = new Map<string, { attendeeName: string; ticketCount: number }>();

  for (const ticket of tickets) {
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

    const attendeeLocale = buyerLocale ?? (event.currencyCode === "USD" ? "en" : "es");

    void sendTicketConfirmationEmail({
      attendeeName: ticket.attendeeName,
      attendeeEmail: ticket.attendeeEmail,
      eventName: event.name,
      eventDates: [],
      eventStartsAt: event.startsAt ? new Date(event.startsAt).toISOString() : undefined,
      flyerImageUrl: event.flyerImageUrl ?? event.coverImageUrl ?? undefined,
      venueName: event.venueAddress ?? "",
      venueAddress: event.venueAddress ?? "",
      sectionName,
      ticketTypeName: ticketType?.name ?? "",
      validDays,
      qrCodeToken: ticket.qrCodeToken ?? "",
      ticketId: ticket.id,
      orderId,
      locale: attendeeLocale,
      hasAccount: true,
      price: ticketType?.price ? Number(ticketType.price) : undefined,
      currencyCode: event.currencyCode ?? "COP",
    }).catch((err) => logger.error(`Failed to send free ticket email to ${ticket.attendeeEmail}: ${err}`));

    if (ticket.attendeePhone && isWhatsAppConfigured()) {
      void sendTicketWhatsApp({
        ticketId: ticket.id,
        attendeeName: ticket.attendeeName,
        attendeePhone: ticket.attendeePhone,
        eventId,
        eventName: event.name,
        venueName: event.venueAddress ?? "",
        venueAddress: event.venueAddress ?? "",
        sectionName,
        ticketTypeName: ticketType?.name ?? "",
        validDays,
        qrCodeToken: ticket.qrCodeToken ?? "",
        orderId,
      }).catch((err) => logger.error(`Failed to send free ticket WhatsApp to ${ticket.attendeePhone}: ${err}`));

      const existing = whatsAppPhones.get(ticket.attendeePhone);
      if (existing) {
        existing.ticketCount += 1;
      } else {
        whatsAppPhones.set(ticket.attendeePhone, { attendeeName: ticket.attendeeName, ticketCount: 1 });
      }
    }

    if (ticket.attendeeUserId) {
      const [attendeeUser] = await db
        .select({ passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.id, ticket.attendeeUserId));
      if (attendeeUser && !attendeeUser.passwordHash) {
        void (async () => {
          try {
            const activationToken = await generateActivationToken(ticket.attendeeUserId!);
            const activationUrl = buildActivationUrl(activationToken);
            await sendAccountActivationEmail({
              attendeeName: ticket.attendeeName,
              attendeeEmail: ticket.attendeeEmail,
              eventName: event.name,
              buyerName: order.buyerName ?? "Someone",
              activationUrl,
              locale: attendeeLocale,
            });
          } catch (err) {
            logger.error({ err }, `Failed to send activation email to ${ticket.attendeeEmail}`);
          }
        })();
      }
    }
  }

  if (whatsAppPhones.size > 0 && event) {
    void queueOrderTicketDocuments(orderId, event.name, whatsAppPhones)
      .catch((err) => logger.error({ err, orderId }, "Failed to send free ticket documents"));
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

  const ticketTypeIds = [...new Set(tickets.map((t) => t.ticketTypeId).filter((id): id is string => id != null))];
  const ttRows = ticketTypeIds.length > 0
    ? await db.select().from(ticketTypesTable).where(inArray(ticketTypesTable.id, ticketTypeIds))
    : [];
  const ttMap = new Map(ttRows.map((tt) => [tt.id, tt]));

  const quantityByType = new Map<string, number>();
  for (const t of tickets) {
    if (!t.ticketTypeId) continue;
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

const transferSchema = z.object({
  recipientName: z.string().min(1).max(255),
  recipientEmail: z.string().email().max(320),
  recipientPhone: z.string().max(30).optional(),
});

router.post(
  "/tickets/:ticketId/transfer",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketId = req.params.ticketId as string;
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const { recipientName, recipientEmail, recipientPhone } = parsed.data;
    const normalizedEmail = recipientEmail.toLowerCase().trim();

    if (normalizedEmail === req.user.email?.toLowerCase().trim()) {
      res.status(400).json({ error: "Cannot transfer ticket to yourself" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(and(
        eq(ticketsTable.id, ticketId),
        eq(ticketsTable.attendeeUserId, req.user.id),
        eq(ticketsTable.status, "valid"),
      ));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found or not eligible for transfer" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, ticket.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { userId: recipientUserId, isNew } = await findOrCreateAttendeeAccount(
      normalizedEmail,
      recipientName,
      recipientPhone,
    );

    if (recipientUserId === req.user.id) {
      res.status(400).json({ error: "Cannot transfer ticket to yourself" });
      return;
    }

    const newQrCodeToken = generateTicketQrToken(ticketId, recipientUserId);

    await db
      .update(ticketsTable)
      .set({
        attendeeName: recipientName,
        attendeeEmail: normalizedEmail,
        attendeePhone: recipientPhone || null,
        attendeeUserId: recipientUserId,
        qrCodeToken: newQrCodeToken,
        updatedAt: new Date(),
      })
      .where(eq(ticketsTable.id, ticketId));

    const senderName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email || "Someone";
    const locale = event.currencyCode === "USD" ? "en" : "es";

    if (isNew) {
      const [recipientUser] = await db.select().from(usersTable).where(eq(usersTable.id, recipientUserId));
      if (recipientUser && !recipientUser.passwordHash) {
        const token = await generateActivationToken(recipientUserId);
        const activationUrl = buildActivationUrl(token);
        void sendAccountActivationEmail({
          attendeeName: recipientName,
          attendeeEmail: normalizedEmail,
          eventName: event.name,
          buyerName: senderName,
          activationUrl,
          locale,
        }).catch((err) => logger.error(`Failed to send activation email: ${err}`));
      }
    }

    void sendTicketTransferEmail({
      recipientName,
      recipientEmail: normalizedEmail,
      senderName,
      eventName: event.name,
      locale,
    }).catch((err) => logger.error(`Failed to send transfer email: ${err}`));

    if (recipientPhone && isWhatsAppConfigured()) {
      const { sendWithTemplate } = await import("../lib/templateResolver");
      const waContext: Record<string, string> = {
        recipientName,
        senderName,
        eventName: event.name,
      };
      const waLogContext: import("../lib/whatsapp").MessageLogContext = {
        triggerType: "ticket_transfer",
        ticketId,
        eventId: event.id,
        attendeeName: recipientName,
      };

      void (async () => {
        try {
          const result = await sendWithTemplate(
            recipientPhone,
            "ticket_transfer",
            [recipientName, senderName, event.name],
            event.id,
            waContext,
            waLogContext,
          );
          if (!result.usedTemplate) {
            const message = [
              `Hola ${recipientName}, tu amigo *${senderName}* te ha transferido uno de sus tickets 🎟️ para asistir a *${event.name}*.`,
              ``,
              `Quieres que te envie aqui tu ticket?`,
            ].join("\n");
            await sendWhatsAppText(recipientPhone, message, waLogContext);
          }
        } catch (err) {
          logger.error(`Failed to send transfer WhatsApp: ${err}`);
        }
      })();
    }

    logger.info({ ticketId, from: req.user.id, to: recipientUserId, recipientEmail: normalizedEmail }, "Ticket transferred");

    res.json({ success: true, ticketId });
  },
);

router.get(
  "/tickets/orders/:orderId/download-link",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { orderId } = req.params as { orderId: string };
    const [order] = await db
      .select({ id: ticketOrdersTable.id, buyerUserId: ticketOrdersTable.buyerUserId })
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.buyerUserId !== req.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const token = generatePdfToken(`order:${orderId}`);
    const appUrl = process.env.APP_URL || "https://attendee.tapee.app";
    res.json({ url: `${appUrl}/attendee-api/api/orders/${orderId}/pdf?token=${token}` });
  },
);

router.get(
  "/tickets/my-orders",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const orders = await db
      .select({
        id: ticketOrdersTable.id,
        eventId: ticketOrdersTable.eventId,
        totalAmount: ticketOrdersTable.totalAmount,
        ticketCount: ticketOrdersTable.ticketCount,
        paymentStatus: ticketOrdersTable.paymentStatus,
        paymentMethod: ticketOrdersTable.paymentMethod,
        wompiTransactionId: ticketOrdersTable.wompiTransactionId,
        wompiReference: ticketOrdersTable.wompiReference,
        createdAt: ticketOrdersTable.createdAt,
      })
      .from(ticketOrdersTable)
      .where(eq(ticketOrdersTable.buyerUserId, req.user.id))
      .orderBy(sql`${ticketOrdersTable.createdAt} DESC`);

    const enriched = await Promise.all(
      orders.map(async (order) => {
        const [event] = await db
          .select({ name: eventsTable.name, coverImageUrl: eventsTable.coverImageUrl, flyerImageUrl: eventsTable.flyerImageUrl, currencyCode: eventsTable.currencyCode })
          .from(eventsTable)
          .where(eq(eventsTable.id, order.eventId));

        const tickets = await db
          .select({
            id: ticketsTable.id,
            attendeeName: ticketsTable.attendeeName,
            ticketTypeId: ticketsTable.ticketTypeId,
            status: ticketsTable.status,
          })
          .from(ticketsTable)
          .where(eq(ticketsTable.orderId, order.id));

        const ticketTypeIds = [...new Set(tickets.map((t) => t.ticketTypeId).filter(Boolean))] as string[];
        const ticketTypes = ticketTypeIds.length
          ? await db
              .select({ id: ticketTypesTable.id, name: ticketTypesTable.name })
              .from(ticketTypesTable)
              .where(inArray(ticketTypesTable.id, ticketTypeIds))
          : [];
        const typeMap = Object.fromEntries(ticketTypes.map((tt) => [tt.id, tt.name]));

        return {
          ...order,
          eventName: event?.name ?? null,
          eventCoverImage: event?.flyerImageUrl ?? event?.coverImageUrl ?? null,
          currencyCode: event?.currencyCode ?? "COP",
          tickets: tickets.map((t) => ({
            ...t,
            ticketTypeName: t.ticketTypeId ? (typeMap[t.ticketTypeId] ?? null) : null,
          })),
        };
      }),
    );

    res.json({ orders: enriched });
  },
);

export { cancelTicketOrder };

export default router;

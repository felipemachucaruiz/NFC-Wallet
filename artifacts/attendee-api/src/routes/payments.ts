import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, braceletsTable, topUpsTable, wompiPaymentIntentsTable, usersTable, eventsTable, ticketOrdersTable, ticketTypesTable, ticketsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { processSelfServicePayment } from "./selfService";
import { processTicketOrderPayment, cancelTicketOrder } from "./tickets";
import { notifyTopUpSuccess, notifyTopUpFailed } from "../lib/pushNotifications";
import { paymentStatusLimiter } from "../middlewares/rateLimiter";

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const router: IRouter = Router();

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || "";

function computeWompiIntegrity(reference: string, amountCentavos: number, currency: string): string {
  const payload = `${reference}${amountCentavos}${currency}${WOMPI_INTEGRITY_SECRET}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
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

const initiatePaymentSchema = z.object({
  braceletUid: z.string().min(1),
  amount: z.number().int().min(1000),
  paymentMethod: z.enum(["nequi", "pse", "card", "bancolombia_transfer"]),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
  userLegalIdType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  userLegalId: z.string().max(20).optional(),
  cardToken: z.string().optional(),
  installments: z.number().int().min(1).max(36).optional(),
});

router.post(
  "/payments/initiate",
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

    const parsed = initiatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { braceletUid, amount, paymentMethod, phoneNumber, bankCode, userLegalIdType, userLegalId, cardToken, installments } = parsed.data;

    if (paymentMethod === "nequi" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Nequi payments" });
      return;
    }
    if (paymentMethod === "pse" && !bankCode) {
      res.status(400).json({ error: "bankCode is required for PSE payments" });
      return;
    }
    if (paymentMethod === "pse" && !userLegalId) {
      res.status(400).json({ error: "userLegalId is required for PSE payments" });
      return;
    }
    if (paymentMethod === "card" && !cardToken) {
      res.status(400).json({ error: "cardToken is required for card payments" });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletUid));

    if (!bracelet) {
      res.status(404).json({ error: "Bracelet not found" });
      return;
    }

    if (req.user.role === "attendee" && bracelet.attendeeUserId !== req.user.id) {
      res.status(403).json({ error: "You can only top up your own bracelet" });
      return;
    }

    if (bracelet.eventId) {
      const [event] = await db
        .select({ nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled })
        .from(eventsTable)
        .where(eq(eventsTable.id, bracelet.eventId));
      if (event && !event.nfcBraceletsEnabled) {
        res.status(404).json({ error: "NFC_BRACELETS_DISABLED", message: "NFC bracelets are not enabled for this event" });
        return;
      }
    }

    const [activeIntent] = await db
      .select({ id: wompiPaymentIntentsTable.id })
      .from(wompiPaymentIntentsTable)
      .where(
        and(
          eq(wompiPaymentIntentsTable.braceletUid, braceletUid),
          inArray(wompiPaymentIntentsTable.status, ["pending", "processing"]),
        ),
      );

    if (activeIntent) {
      res.status(409).json({
        error: "PAYMENT_ALREADY_IN_PROGRESS",
        message: "There is already a payment in progress for this bracelet. Please wait for it to complete or expire.",
        existingIntentId: activeIntent.id,
      });
      return;
    }

    const [userRecord] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const customerEmail = userRecord?.email || `attendee_${req.user.id}@evento.local`;

    const reference = `topup_${braceletUid}_${Date.now()}`;
    let wompiTransactionId: string | undefined;
    let redirectUrl: string | undefined;

    try {
      const { acceptanceToken, personalAuthToken } = await fetchWompiTokens();
      // Wompi (Colombian payment gateway) only processes COP transactions.
      // For non-COP events, amount is collected in COP and credited to bracelet in event currency.
      const amountCentavos = Math.round(amount * 100);

      let wompiBody: Record<string, unknown>;

      if (paymentMethod === "nequi") {
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
      } else if (paymentMethod === "card") {
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
      } else if (paymentMethod === "bancolombia_transfer") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "BANCOLOMBIA_TRANSFER",
            user_type: "PERSON",
            payment_description: "Recarga pulsera evento",
          },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
          redirect_url: `${process.env.APP_URL ?? "https://attendee.tapee.app"}/payment-return`,
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
            payment_description: "Recarga pulsera evento",
          },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
          redirect_url: `${process.env.APP_URL ?? "https://attendee.tapee.app"}/payment-return`,
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

      const wompiData = await wompiRes.json() as { data?: { id: string; payment_method_type?: string; payment_method?: { extra?: { async_payment_url?: string } } }; error?: { type?: string; messages?: string[] | Record<string, unknown> } };
      if (!wompiRes.ok || !wompiData.data) {
        console.error(`Wompi ${paymentMethod} error:`, JSON.stringify(wompiData), "| amountCentavos:", amountCentavos, "| reference:", reference);
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
        res.status(502).json({ error: wompiMsg ? `Error del sistema de pago: ${wompiMsg}` : `Failed to initiate ${paymentMethod} payment. Try again.` });
        return;
      }
      wompiTransactionId = wompiData.data.id;
      if (paymentMethod === "pse" || paymentMethod === "bancolombia_transfer") {
        redirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Wompi API error:", errMsg, "| WOMPI_BASE_URL:", WOMPI_BASE_URL);
      res.status(502).json({ error: `Payment gateway error: ${errMsg}` });
      return;
    }

    const [intent] = await db
      .insert(wompiPaymentIntentsTable)
      .values({
        braceletUid,
        amount,
        paymentMethod,
        phoneNumber,
        bankCode,
        wompiTransactionId,
        wompiReference: reference,
        redirectUrl,
        status: "pending",
        performedByUserId: req.user.id,
      })
      .returning();

    res.status(201).json({
      intentId: intent.id,
      status: intent.status,
      paymentMethod,
      wompiTransactionId,
      redirectUrl: redirectUrl ?? null,
    });
  },
);

router.get(
  "/payments/:id/status",
  requireRole("attendee"),
  paymentStatusLimiter,
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = req.params.id as string;
    const [intent] = await db
      .select()
      .from(wompiPaymentIntentsTable)
      .where(eq(wompiPaymentIntentsTable.id, id));

    if (!intent) {
      res.status(404).json({ error: "Payment intent not found" });
      return;
    }

    if (intent.performedByUserId !== req.user.id && req.user.role !== "admin" && req.user.role !== "bank") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if ((intent.status === "pending" || intent.status === "processing") && intent.wompiTransactionId) {
      try {
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${intent.wompiTransactionId}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const wompiData = await wompiRes.json() as { data?: { status: string } };
        if (wompiRes.ok && wompiData.data) {
          const wompiStatus = wompiData.data.status;
          if (wompiStatus === "APPROVED") {
            await processSuccessfulPayment(intent.id, intent.wompiTransactionId!);
            const [updated] = await db.select().from(wompiPaymentIntentsTable).where(eq(wompiPaymentIntentsTable.id, id));
            res.json({ intentId: updated.id, status: updated.status, topUpId: updated.topUpId });
            return;
          } else if (wompiStatus === "DECLINED" || wompiStatus === "ERROR" || wompiStatus === "VOIDED") {
            await db.update(wompiPaymentIntentsTable)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(wompiPaymentIntentsTable.id, id));
            if (intent.performedByUserId) {
              const [fb] = intent.braceletUid ? await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, intent.braceletUid)).limit(1) : [undefined];
              let fcc = "COP";
              if (fb?.eventId) { const [fe] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, fb.eventId)).limit(1); if (fe) fcc = fe.currencyCode; }
              void notifyTopUpFailed(intent.performedByUserId, intent.amount, fcc).catch(() => {});
            }
            res.json({ intentId: id, status: "failed" });
            return;
          }
        }
      } catch (err) {
        console.error("Wompi status poll error:", err);
      }
    }

    const clientStatus = intent.status === "processing" ? "pending" : intent.status;
    res.json({
      intentId: intent.id,
      status: clientStatus,
      topUpId: intent.topUpId ?? null,
    });
  },
);

async function processSuccessfulPayment(intentId: string, wompiTransactionId: string) {
  let notifyBraceletUid: string | null = null;
  let notifyAmount = 0;
  let notifyNewBalance = 0;

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(wompiPaymentIntentsTable.id, intentId),
          eq(wompiPaymentIntentsTable.status, "pending"),
        ),
      )
      .returning();

    if (claimed.length === 0) return;
    const intent = claimed[0];

    if (!intent.braceletUid) return;
    const braceletUid = intent.braceletUid;

    let [bracelet] = await tx
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, braceletUid));

    if (!bracelet) {
      const [created] = await tx
        .insert(braceletsTable)
        .values({ nfcUid: braceletUid, lastKnownBalance: 0, lastCounter: 0 })
        .returning();
      bracelet = created;
    }

    const newBalance = bracelet.lastKnownBalance + intent.amount;
    const newCounter = bracelet.lastCounter + 1;

    const topUpPaymentMethod = intent.paymentMethod === "card" ? "card_external" as const : intent.paymentMethod;
    const [topUp] = await tx
      .insert(topUpsTable)
      .values({
        braceletUid,
        amount: intent.amount,
        paymentMethod: topUpPaymentMethod,
        performedByUserId: intent.performedByUserId ?? "self-service",
        wompiTransactionId,
        status: "completed",
        newBalance: newBalance,
        newCounter,
      })
      .returning();

    await tx
      .update(braceletsTable)
      .set({ lastKnownBalance: newBalance, lastCounter: newCounter, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, braceletUid));

    await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "success", topUpId: topUp.id, updatedAt: new Date() })
      .where(eq(wompiPaymentIntentsTable.id, intentId));

    notifyBraceletUid = braceletUid;
    notifyAmount = intent.amount;
    notifyNewBalance = newBalance;
  });

  if (notifyBraceletUid) {
    const [b] = await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, notifyBraceletUid)).limit(1);
    let cc = "COP";
    if (b?.eventId) {
      const [ev] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, b.eventId)).limit(1);
      if (ev) cc = ev.currencyCode;
    }
    void notifyTopUpSuccess(notifyBraceletUid, notifyAmount, notifyNewBalance, cc).catch(() => {});
  }
}

router.post(
  "/payments/webhook",
  async (req: Request, res: Response) => {
    if (!WOMPI_EVENTS_SECRET) {
      console.error("WOMPI_EVENTS_SECRET not configured — rejecting webhook");
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

    const rawTimestamp = body.timestamp;
    if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
      console.warn("Rejecting Wompi webhook with invalid timestamp", { timestamp: rawTimestamp });
      res.status(400).json({ error: "Webhook timestamp is invalid" });
      return;
    }
    const webhookTimestampMs = rawTimestamp * 1000;
    const nowMs = Date.now();
    if (Math.abs(nowMs - webhookTimestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
      console.warn("Rejecting stale Wompi webhook — timestamp out of 5-minute window", { timestamp: rawTimestamp });
      res.status(400).json({ error: "Webhook timestamp is stale" });
      return;
    }

    if (body.environment === "test" && process.env.NODE_ENV === "production") {
      console.warn("Rejecting test-mode Wompi webhook in production");
      res.status(400).json({ error: "Test webhooks are not accepted in production" });
      return;
    }

    if (body.event === "transaction.updated" && txData) {
      if (txData.status === "APPROVED") {
        const [intent] = await db
          .select()
          .from(wompiPaymentIntentsTable)
          .where(eq(wompiPaymentIntentsTable.wompiTransactionId, txData.id));

        if (!intent) {
          const [orphanOrder] = await db
            .select()
            .from(ticketOrdersTable)
            .where(
              and(
                eq(ticketOrdersTable.wompiTransactionId, txData.id),
                eq(ticketOrdersTable.paymentStatus, "pending"),
              ),
            );
          if (orphanOrder) {
            console.info({ orderId: orphanOrder.id, wompiTransactionId: txData.id }, "Recovering orphan ticket order from Wompi webhook — no payment intent found");
            await processTicketOrderPayment(orphanOrder.id, txData.id);
          }
          res.json({ success: true });
          return;
        }

        if (intent.status === "success" || intent.status === "failed") {
          res.json({ success: true });
          return;
        }

        if (intent.status === "pending") {
          if (intent.purposeType === "ticket" && intent.ticketOrderId) {
            await processTicketOrderPayment(intent.ticketOrderId, txData.id);
          } else if (intent.selfService) {
            await processSelfServicePayment(intent.id, txData.id);
          } else {
            await processSuccessfulPayment(intent.id, txData.id);
          }
        }
      } else if (txData.status === "DECLINED" || txData.status === "ERROR" || txData.status === "VOIDED") {
        const [intent] = await db
          .select()
          .from(wompiPaymentIntentsTable)
          .where(eq(wompiPaymentIntentsTable.wompiTransactionId, txData.id));

        if (intent && intent.status === "pending") {
          if (intent.purposeType === "ticket" && intent.ticketOrderId) {
            await cancelTicketOrder(intent.ticketOrderId);
          } else {
            await db
              .update(wompiPaymentIntentsTable)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(wompiPaymentIntentsTable.id, intent.id));
            if (intent.performedByUserId && intent.braceletUid) {
              const [fb2] = await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, intent.braceletUid)).limit(1);
              let fcc2 = "COP";
              if (fb2?.eventId) { const [fe2] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, fb2.eventId)).limit(1); if (fe2) fcc2 = fe2.currencyCode; }
              void notifyTopUpFailed(intent.performedByUserId, intent.amount, fcc2).catch(() => {});
            }
          }
        }
      }
    }

    res.json({ success: true });
  },
);

const pseBankSchema = z.object({
  financial_institution_code: z.string(),
  financial_institution_name: z.string(),
});
const pseBanksResponseSchema = z.object({ data: z.array(pseBankSchema) });
type PseBank = z.infer<typeof pseBankSchema>;

let pseBanksCache: { data: PseBank[]; fetchedAt: number } | null = null;
const PSE_BANKS_CACHE_TTL_MS = 5 * 60 * 1000;

router.get(
  "/payments/pse/banks",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!WOMPI_PUBLIC_KEY) {
      res.status(503).json({ error: "Payment gateway not configured" });
      return;
    }

    if (pseBanksCache && Date.now() - pseBanksCache.fetchedAt < PSE_BANKS_CACHE_TTL_MS) {
      res.json({ data: pseBanksCache.data });
      return;
    }

    try {
      const wompiRes = await fetch(
        `${WOMPI_BASE_URL}/pse/financial_institutions?public_key=${encodeURIComponent(WOMPI_PUBLIC_KEY)}`
      );
      if (!wompiRes.ok) {
        res.status(502).json({ error: "Failed to fetch PSE banks from payment gateway" });
        return;
      }
      const raw = await wompiRes.json();
      const parsed = pseBanksResponseSchema.safeParse(raw);
      if (!parsed.success) {
        res.status(502).json({ error: "Unexpected response format from payment gateway" });
        return;
      }
      pseBanksCache = { data: parsed.data.data, fetchedAt: Date.now() };
      res.json({ data: parsed.data.data });
    } catch (err) {
      res.status(502).json({ error: "Failed to fetch PSE banks" });
    }
  },
);

router.get(
  "/config/wompi",
  (req: Request, res: Response) => {
    res.json({
      publicKey: WOMPI_PUBLIC_KEY,
      baseUrl: WOMPI_BASE_URL,
    });
  },
);

export default router;

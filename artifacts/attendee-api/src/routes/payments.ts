import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger";
import { db, braceletsTable, topUpsTable, wompiPaymentIntentsTable, usersTable, eventsTable, ticketOrdersTable, ticketTypesTable, ticketsTable, savedCardsTable, platformConfigTable } from "@workspace/db";
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

const browserInfoSchema = z.object({
  browser_color_depth: z.string(),
  browser_screen_height: z.string(),
  browser_screen_width: z.string(),
  browser_language: z.string(),
  browser_user_agent: z.string(),
  browser_tz: z.string(),
});

const initiatePaymentSchema = z.object({
  braceletUid: z.string().min(1).optional(),
  amount: z.number().int().min(1000),
  paymentMethod: z.enum(["nequi", "pse", "card", "bancolombia_transfer", "daviplata", "puntoscolombia"]),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
  pseUserType: z.number().int().min(0).max(1).optional(),
  pseEmail: z.string().email().max(254).optional(),
  userLegalIdType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  userLegalId: z.string().max(20).optional(),
  cardToken: z.string().optional(),
  savedCardId: z.string().optional(),
  installments: z.number().int().min(1).max(36).optional(),
  browserInfo: browserInfoSchema.optional(),
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
    if (parsed.success) {
      const [config] = await db.select({ enabledPaymentMethods: platformConfigTable.enabledPaymentMethods }).from(platformConfigTable).limit(1);
      const enabled: string[] = config?.enabledPaymentMethods ?? ["nequi", "pse", "card", "bancolombia_transfer", "daviplata", "puntoscolombia"];
      if (!enabled.includes(parsed.data.paymentMethod)) {
        res.status(400).json({ error: "Payment method not available" });
        return;
      }
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { braceletUid, amount, paymentMethod, phoneNumber, bankCode, pseUserType, pseEmail, userLegalIdType, userLegalId, savedCardId, installments, browserInfo } = parsed.data;
    let { cardToken } = parsed.data;

    if (paymentMethod === "nequi" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Nequi payments" });
      return;
    }
    if (paymentMethod === "daviplata" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Daviplata payments" });
      return;
    }
    if (paymentMethod === "puntoscolombia" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Puntos Colombia payments" });
      return;
    }
    if (paymentMethod === "puntoscolombia" && !userLegalId) {
      res.status(400).json({ error: "userLegalId is required for Puntos Colombia payments" });
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
    if (paymentMethod === "card") {
      if (savedCardId) {
        const [savedCard] = await db
          .select({ wompiToken: savedCardsTable.wompiToken })
          .from(savedCardsTable)
          .where(and(eq(savedCardsTable.id, savedCardId), eq(savedCardsTable.userId, req.user.id)));
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

    const isPreload = !braceletUid;

    if (!isPreload) {
      const [bracelet] = await db
        .select()
        .from(braceletsTable)
        .where(eq(braceletsTable.nfcUid, braceletUid!));

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
            eq(wompiPaymentIntentsTable.braceletUid, braceletUid!),
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
    } else {
      // Pre-load: block concurrent pre-load intents per user
      const [activePreload] = await db
        .select({ id: wompiPaymentIntentsTable.id })
        .from(wompiPaymentIntentsTable)
        .where(
          and(
            eq(wompiPaymentIntentsTable.performedByUserId, req.user.id),
            eq(wompiPaymentIntentsTable.purposeType, "preload"),
            inArray(wompiPaymentIntentsTable.status, ["pending", "processing"]),
          ),
        );

      if (activePreload) {
        res.status(409).json({
          error: "PAYMENT_ALREADY_IN_PROGRESS",
          message: "There is already a pre-load payment in progress. Please wait for it to complete.",
          existingIntentId: activePreload.id,
        });
        return;
      }
    }

    const [userRecord] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const customerEmail = userRecord?.email || `attendee_${req.user.id}@evento.local`;

    const buyerFullName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(" ") || customerEmail;
    const reference = isPreload ? `preload_${req.user.id}_${Date.now()}` : `topup_${braceletUid}_${Date.now()}`;
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
        const defaultBrowserInfo = {
          browser_color_depth: "24",
          browser_screen_height: "844",
          browser_screen_width: "390",
          browser_language: "es-CO",
          browser_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          browser_tz: "-300",
        };
        const effectiveBrowserInfo = browserInfo ?? defaultBrowserInfo;
        const useThreeDs = WOMPI_PUBLIC_KEY.startsWith("pub_prod_");
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
          ...(useThreeDs ? { is_three_ds: true, three_ds_auth_type: "challenge_v2" } : {}),
          customer_data: {
            full_name: buyerFullName,
            phone_number: phoneNumber || userRecord?.phone || "0000000000",
            ...(useThreeDs ? { browser_info: effectiveBrowserInfo } : {}),
          },
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
      } else if (paymentMethod === "daviplata") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "DAVIPLATA",
            phone_number: phoneNumber,
          },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
        };
      } else if (paymentMethod === "puntoscolombia") {
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "PCOL",
            phone_number: `+57${(phoneNumber ?? "").replace(/\D/g, "").replace(/^57/, "")}`,
            identification_type: userLegalIdType ?? "CC",
            identification_number: userLegalId!,
          },
          reference,
          acceptance_token: acceptanceToken,
          acceptance_personal_auth_token: personalAuthToken,
        };
      } else {
        const pseCustomerEmail = pseEmail ?? customerEmail;
        wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: pseCustomerEmail,
          payment_method: {
            type: "PSE",
            user_type: pseUserType ?? 0,
            user_legal_id_type: userLegalIdType ?? "CC",
            user_legal_id: userLegalId!,
            financial_institution_code: bankCode,
            payment_description: "Recarga pulsera evento",
          },
          customer_data: {
            full_name: buyerFullName,
            phone_number: phoneNumber || userRecord?.phone || "0000000000",
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
      Sentry.captureException(err instanceof Error ? err : new Error(errMsg), {
        tags: { route: "payments/initiate", paymentMethod },
        extra: { reference, amountCentavos, WOMPI_BASE_URL },
      });
      res.status(502).json({ error: `Payment gateway error: ${errMsg}` });
      return;
    }

    const [intent] = await db
      .insert(wompiPaymentIntentsTable)
      .values({
        braceletUid: braceletUid ?? null,
        amount,
        paymentMethod,
        phoneNumber,
        bankCode,
        wompiTransactionId,
        wompiReference: reference,
        redirectUrl,
        status: "pending",
        purposeType: isPreload ? "preload" : "topup",
        performedByUserId: req.user.id,
      })
      .returning();

    res.status(201).json({
      intentId: intent.id,
      status: intent.status,
      paymentMethod,
      purposeType: intent.purposeType,
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

    type WompiThreeDsAuth = {
      current_step: string;
      current_step_status: string;
      three_ds_method_data?: string;
      iframe_content?: string;
    };
    type WompiTxData = {
      status: string;
      payment_method?: { extra?: { three_ds_auth?: WompiThreeDsAuth } };
    };

    let threeDsAuth: WompiThreeDsAuth | null = null;

    if ((intent.status === "pending" || intent.status === "processing") && intent.wompiTransactionId) {
      try {
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${intent.wompiTransactionId}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const wompiData = await wompiRes.json() as { data?: WompiTxData };
        if (wompiRes.ok && wompiData.data) {
          const wompiStatus = wompiData.data.status;
          threeDsAuth = wompiData.data.payment_method?.extra?.three_ds_auth ?? null;

          if (wompiStatus === "APPROVED") {
            await processSuccessfulPayment(intent.id, intent.wompiTransactionId!);
            const [updated] = await db.select().from(wompiPaymentIntentsTable).where(eq(wompiPaymentIntentsTable.id, id));
            res.json({ intentId: updated.id, status: updated.status, topUpId: updated.topUpId, threeDsAuth: null });
            return;
          } else if (wompiStatus === "DECLINED" || wompiStatus === "ERROR" || wompiStatus === "VOIDED") {
            await db.update(wompiPaymentIntentsTable)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(wompiPaymentIntentsTable.id, id));
            if (intent.performedByUserId) {
              let fcc = "COP";
              if (intent.braceletUid) {
                const [fb] = await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, intent.braceletUid)).limit(1);
                if (fb?.eventId) { const [fe] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, fb.eventId)).limit(1); if (fe) fcc = fe.currencyCode; }
              }
              void notifyTopUpFailed(intent.performedByUserId, intent.amount, fcc).catch(() => {});
            }
            res.json({ intentId: id, status: "failed", threeDsAuth: null });
            return;
          }
        }
      } catch (err) {
        console.error("Wompi status poll error:", err);
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { route: "payments/status-poll" },
          extra: { intentId: id, wompiTransactionId: intent.wompiTransactionId },
        });
      }
    }

    const clientStatus = intent.status === "processing" ? "pending" : intent.status;
    res.json({
      intentId: intent.id,
      status: clientStatus,
      purposeType: intent.purposeType,
      topUpId: intent.topUpId ?? null,
      threeDsAuth,
    });
  },
);

async function processSuccessfulPayment(intentId: string, wompiTransactionId: string) {
  let notifyBraceletUid: string | null = null;
  let notifyUserId: string | null = null;
  let notifyAmount = 0;
  let notifyNewBalance = 0;
  let notifyIsPreload = false;

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

    // Pre-load: no bracelet yet — credit user's pending wallet balance
    if (intent.purposeType === "preload" && !intent.braceletUid) {
      if (!intent.performedByUserId) return;

      const [updated] = await tx
        .update(usersTable)
        .set({
          pendingWalletBalance: sql`${usersTable.pendingWalletBalance} + ${intent.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, intent.performedByUserId))
        .returning({ pendingWalletBalance: usersTable.pendingWalletBalance });

      await tx
        .update(wompiPaymentIntentsTable)
        .set({ status: "success", updatedAt: new Date() })
        .where(eq(wompiPaymentIntentsTable.id, intentId));

      notifyUserId = intent.performedByUserId;
      notifyIsPreload = true;
      notifyAmount = intent.amount;
      notifyNewBalance = updated?.pendingWalletBalance ?? intent.amount;
      return;
    }

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

    // Activation fee: deducted from first top-up amount, recorded for settlement
    const isFirstActivation = !bracelet.activatedAt;
    let activationFeeAmount = 0;
    if (isFirstActivation) {
      activationFeeAmount = 3000; // default
      if (bracelet.eventId) {
        const [ev] = await tx
          .select({ braceletActivationFee: eventsTable.braceletActivationFee })
          .from(eventsTable)
          .where(eq(eventsTable.id, bracelet.eventId));
        if (ev) activationFeeAmount = ev.braceletActivationFee;
      }
      // If the paid amount doesn't cover the fee, don't charge it (edge case: very small topup)
      if (intent.amount <= activationFeeAmount) activationFeeAmount = 0;
    }

    const braceletAmount = intent.amount - activationFeeAmount;
    const newBalance = bracelet.lastKnownBalance + braceletAmount;
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
        newBalance,
        newCounter,
        activationFeeAmount,
      })
      .returning();

    await tx
      .update(braceletsTable)
      .set({
        lastKnownBalance: newBalance,
        lastCounter: newCounter,
        activatedAt: bracelet.activatedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, braceletUid));

    await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "success", topUpId: topUp.id, updatedAt: new Date() })
      .where(eq(wompiPaymentIntentsTable.id, intentId));

    notifyBraceletUid = braceletUid;
    notifyAmount = braceletAmount;
    notifyNewBalance = newBalance;
  });

  if (notifyIsPreload && notifyUserId) {
    void notifyTopUpSuccess(notifyUserId, notifyAmount, notifyNewBalance, "COP").catch(() => {});
  } else if (notifyBraceletUid) {
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
      res.status(401).json({ error: "Invalid webhook signature" });
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

    const isProductionWompiKey = WOMPI_PUBLIC_KEY.startsWith("pub_prod_");
    if (body.environment === "test" && isProductionWompiKey) {
      console.warn("Rejecting test-mode Wompi webhook when using production keys");
      res.status(400).json({ error: "Test webhooks are not accepted with production keys" });
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

        if (intent.status === "pending" || intent.status === "expired") {
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

        if (intent && (intent.status === "pending" || intent.status === "expired")) {
          if (intent.purposeType === "ticket" && intent.ticketOrderId) {
            await cancelTicketOrder(intent.ticketOrderId);
          } else {
            await db
              .update(wompiPaymentIntentsTable)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(wompiPaymentIntentsTable.id, intent.id));
            if (intent.performedByUserId) {
              let fcc2 = "COP";
              if (intent.braceletUid) {
                const [fb2] = await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, intent.braceletUid)).limit(1);
                if (fb2?.eventId) { const [fe2] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, fb2.eventId)).limit(1); if (fe2) fcc2 = fe2.currencyCode; }
              }
              void notifyTopUpFailed(intent.performedByUserId, intent.amount, fcc2).catch(() => {});
            }
          }
        }
      }
    }

    res.json({ success: true });
  },
);

// financial_institution_code comes back as either a string or number depending on Wompi env
const pseBankSchema = z.object({
  financial_institution_code: z.coerce.string(),
  financial_institution_name: z.string(),
});
const pseBanksResponseSchema = z.object({ data: z.array(pseBankSchema) });
type PseBank = z.infer<typeof pseBankSchema>;

// Known Colombian banks — used as fallback if the Wompi API is unavailable
const PSE_BANKS_FALLBACK: PseBank[] = [
  { financial_institution_code: "1007", financial_institution_name: "Bancolombia" },
  { financial_institution_code: "1009", financial_institution_name: "Citibank" },
  { financial_institution_code: "1013", financial_institution_name: "BBVA Colombia" },
  { financial_institution_code: "1019", financial_institution_name: "Scotiabank Colpatria" },
  { financial_institution_code: "1023", financial_institution_name: "Banco de Occidente" },
  { financial_institution_code: "1032", financial_institution_name: "Banco Caja Social" },
  { financial_institution_code: "1040", financial_institution_name: "Banco Agrario" },
  { financial_institution_code: "1051", financial_institution_name: "Davivienda" },
  { financial_institution_code: "1052", financial_institution_name: "AV Villas" },
  { financial_institution_code: "1062", financial_institution_name: "Banco Falabella" },
  { financial_institution_code: "1063", financial_institution_name: "Banco Finandina" },
  { financial_institution_code: "1065", financial_institution_name: "Banco Santander de Negocios" },
  { financial_institution_code: "1066", financial_institution_name: "Banco Cooperativo Coopcentral" },
  { financial_institution_code: "1151", financial_institution_name: "Rappipay" },
  { financial_institution_code: "1507", financial_institution_name: "Nequi" },
];

let pseBanksCache: { data: PseBank[]; fetchedAt: number } | null = null;
const PSE_BANKS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getPseBanksData(res: Response) {
    if (pseBanksCache && Date.now() - pseBanksCache.fetchedAt < PSE_BANKS_CACHE_TTL_MS) {
      res.json({ data: pseBanksCache.data });
      return;
    }

    if (!WOMPI_PUBLIC_KEY) {
      res.json({ data: PSE_BANKS_FALLBACK });
      return;
    }

    try {
      const wompiRes = await fetch(
        `${WOMPI_BASE_URL}/pse/financial_institutions?public_key=${encodeURIComponent(WOMPI_PUBLIC_KEY)}`
      );
      if (!wompiRes.ok) {
        logger.warn({ status: wompiRes.status }, "Wompi PSE banks non-OK, serving fallback");
        res.json({ data: PSE_BANKS_FALLBACK });
        return;
      }
      const raw = await wompiRes.json();
      const parsed = pseBanksResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({ zodError: parsed.error.message }, "Wompi PSE banks schema mismatch, serving fallback");
        res.json({ data: PSE_BANKS_FALLBACK });
        return;
      }
      pseBanksCache = { data: parsed.data.data, fetchedAt: Date.now() };
      res.json({ data: parsed.data.data });
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { route: "payments/pse-banks" },
      });
      res.json({ data: PSE_BANKS_FALLBACK });
    }
}

router.get(
  "/payments/pse/banks/public",
  async (req: Request, res: Response) => {
    await getPseBanksData(res);
  },
);

router.get(
  "/payments/pse/banks",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await getPseBanksData(res);
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

router.get(
  "/user/wallet",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [user] = await db
      .select({ pendingWalletBalance: usersTable.pendingWalletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));

    res.json({ pendingWalletBalance: user?.pendingWalletBalance ?? 0 });
  },
);

export default router;

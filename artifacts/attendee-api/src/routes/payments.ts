import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, braceletsTable, topUpsTable, wompiPaymentIntentsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";
import { processSelfServicePayment } from "./selfService";

const router: IRouter = Router();

const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";

async function fetchWompiAcceptanceToken(): Promise<string> {
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch Wompi acceptance token");
  const data = await res.json() as { data: { presigned_acceptance: { acceptance_token: string } } };
  return data.data.presigned_acceptance.acceptance_token;
}

const initiatePaymentSchema = z.object({
  braceletUid: z.string().min(1),
  amountCop: z.number().int().min(1000),
  paymentMethod: z.enum(["nequi", "pse"]),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
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
    const { braceletUid, amountCop, paymentMethod, phoneNumber, bankCode } = parsed.data;

    if (paymentMethod === "nequi" && !phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required for Nequi payments" });
      return;
    }
    if (paymentMethod === "pse" && !bankCode) {
      res.status(400).json({ error: "bankCode is required for PSE payments" });
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

    const [userRecord] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const customerEmail = userRecord?.email || `attendee_${req.user.id}@evento.local`;

    const reference = `topup_${braceletUid}_${Date.now()}`;
    let wompiTransactionId: string | undefined;
    let redirectUrl: string | undefined;

    try {
      const acceptanceToken = await fetchWompiAcceptanceToken();
      const amountCentavos = amountCop * 100;

      if (paymentMethod === "nequi") {
        const wompiBody = {
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

        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          },
          body: JSON.stringify(wompiBody),
        });

        const wompiData = await wompiRes.json() as { data?: { id: string }; error?: { type: string; messages: Record<string, string[]> } };
        if (!wompiRes.ok || !wompiData.data) {
          console.error("Wompi Nequi error:", wompiData);
          res.status(502).json({ error: "Failed to initiate Nequi payment. Check phone number and try again." });
          return;
        }
        wompiTransactionId = wompiData.data.id;
      } else {
        const wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: {
            type: "PSE",
            user_type: 0,
            user_legal_id_type: "CC",
            user_legal_id: "1234567890",
            financial_institution_code: bankCode,
            payment_description: "Recarga pulsera evento",
          },
          reference,
          acceptance_token: acceptanceToken,
          redirect_url: `${process.env.APP_URL ?? "https://example.com"}/payment-return`,
        };

        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          },
          body: JSON.stringify(wompiBody),
        });

        const wompiData = await wompiRes.json() as { data?: { id: string; payment_method_type?: string; payment_method?: { extra?: { async_payment_url?: string } } }; error?: unknown };
        if (!wompiRes.ok || !wompiData.data) {
          console.error("Wompi PSE error:", wompiData);
          res.status(502).json({ error: "Failed to initiate PSE payment. Try again." });
          return;
        }
        wompiTransactionId = wompiData.data.id;
        redirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
      }
    } catch (err) {
      console.error("Wompi API error:", err);
      res.status(502).json({ error: "Payment gateway unavailable. Try again later." });
      return;
    }

    const [intent] = await db
      .insert(wompiPaymentIntentsTable)
      .values({
        braceletUid,
        amountCop,
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

    let [bracelet] = await tx
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, intent.braceletUid));

    if (!bracelet) {
      const [created] = await tx
        .insert(braceletsTable)
        .values({ nfcUid: intent.braceletUid, lastKnownBalanceCop: 0, lastCounter: 0 })
        .returning();
      bracelet = created;
    }

    const newBalance = bracelet.lastKnownBalanceCop + intent.amountCop;
    const newCounter = bracelet.lastCounter + 1;

    const [topUp] = await tx
      .insert(topUpsTable)
      .values({
        braceletUid: intent.braceletUid,
        amountCop: intent.amountCop,
        paymentMethod: intent.paymentMethod,
        performedByUserId: intent.performedByUserId,
        wompiTransactionId,
        status: "completed",
        newBalanceCop: newBalance,
        newCounter,
      })
      .returning();

    await tx
      .update(braceletsTable)
      .set({ lastKnownBalanceCop: newBalance, lastCounter: newCounter, updatedAt: new Date() })
      .where(eq(braceletsTable.nfcUid, intent.braceletUid));

    await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "success", topUpId: topUp.id, updatedAt: new Date() })
      .where(eq(wompiPaymentIntentsTable.id, intentId));
  });
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

    if (body.event === "transaction.updated" && txData) {
      if (txData.status === "APPROVED") {
        const [intent] = await db
          .select()
          .from(wompiPaymentIntentsTable)
          .where(eq(wompiPaymentIntentsTable.wompiTransactionId, txData.id));

        if (intent && intent.status === "pending") {
          if (intent.selfService) {
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
          await db
            .update(wompiPaymentIntentsTable)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(wompiPaymentIntentsTable.id, intent.id));
        }
      }
    }

    res.json({ success: true });
  },
);

export default router;

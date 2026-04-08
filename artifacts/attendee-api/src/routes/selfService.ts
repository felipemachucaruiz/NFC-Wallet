import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable, wompiPaymentIntentsTable, topUpsTable } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { notifyTopUpSuccess } from "../lib/pushNotifications";

const router: IRouter = Router();

const VALID_UID_HEX_LENGTHS = new Set([8, 14, 20]);

function normalizeUid(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (!VALID_UID_HEX_LENGTHS.has(hex.length)) return null;
  return hex.match(/.{2}/g)!.join(":");
}

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

router.get(
  "/public/bracelet-lookup",
  async (req: Request, res: Response) => {
    const rawUid = (req.query.uid as string | undefined) ?? "";
    const uid = normalizeUid(rawUid);
    if (!uid) {
      res.status(400).json({ error: "uid query param is required and must be valid hex" });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, uid));

    if (!bracelet) {
      res.status(404).json({ error: "BRACELET_NOT_FOUND" });
      return;
    }

    if (bracelet.flagged) {
      res.status(403).json({ error: "BRACELET_FLAGGED" });
      return;
    }

    let eventName: string | null = null;
    let eventActive = false;
    if (bracelet.eventId) {
      const [event] = await db
        .select({ name: eventsTable.name, active: eventsTable.active })
        .from(eventsTable)
        .where(eq(eventsTable.id, bracelet.eventId));
      eventName = event?.name ?? null;
      eventActive = event?.active ?? false;
    }

    res.json({
      uid: bracelet.nfcUid,
      balance: bracelet.lastKnownBalance,
      pendingSync: bracelet.pendingSync,
      attendeeName: bracelet.attendeeName ?? null,
      eventName,
      eventActive,
    });
  },
);

const selfServiceInitiateSchema = z.object({
  braceletUid: z.string().min(1),
  amount: z.number().int().min(1000),
  paymentMethod: z.enum(["nequi", "pse"]),
  phoneNumber: z.string().optional(),
  bankCode: z.string().optional(),
  contactEmail: z.string().email().optional(),
  userLegalIdType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  userLegalId: z.string().max(20).optional(),
});

router.post(
  "/public/topup/initiate",
  async (req: Request, res: Response) => {
    if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
      res.status(503).json({ error: "Payment gateway not configured" });
      return;
    }

    const parsed = selfServiceInitiateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { braceletUid, amount, paymentMethod, phoneNumber, bankCode, contactEmail, userLegalIdType, userLegalId } = parsed.data;

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

    const uid = normalizeUid(braceletUid);
    if (!uid) {
      res.status(400).json({ error: "braceletUid must be a valid hex UID" });
      return;
    }
    let [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, uid));

    if (!bracelet) {
      const [created] = await db
        .insert(braceletsTable)
        .values({ nfcUid: uid, lastKnownBalance: 0, lastCounter: 0, pendingSync: false })
        .onConflictDoNothing()
        .returning();
      if (created) {
        bracelet = created;
      } else {
        const [existing] = await db
          .select()
          .from(braceletsTable)
          .where(eq(braceletsTable.nfcUid, uid));
        bracelet = existing;
      }
    }

    if (!bracelet) {
      res.status(500).json({ error: "Failed to resolve bracelet record" });
      return;
    }

    if (bracelet.flagged) {
      res.status(403).json({ error: "Esta pulsera ha sido bloqueada. Contacta al organizador del evento." });
      return;
    }

    const [activeIntent] = await db
      .select({ id: wompiPaymentIntentsTable.id })
      .from(wompiPaymentIntentsTable)
      .where(
        and(
          eq(wompiPaymentIntentsTable.braceletUid, uid),
          inArray(wompiPaymentIntentsTable.status, ["pending", "processing"]),
        ),
      );

    if (activeIntent) {
      res.status(409).json({
        error: "PAYMENT_ALREADY_IN_PROGRESS",
        message: "Ya hay un pago en curso para esta pulsera. Por favor espera a que se complete o expire.",
        existingIntentId: activeIntent.id,
      });
      return;
    }

    const customerEmail = contactEmail ?? `selfservice_${uid.toLowerCase()}@evento.local`;
    const reference = `ss_${uid}_${Date.now()}`;

    let wompiTransactionId: string | undefined;
    let redirectUrl: string | undefined;

    try {
      const acceptanceToken = await fetchWompiAcceptanceToken();
      const amountCentavos = amount * 100;

      if (paymentMethod === "nequi") {
        const wompiBody = {
          amount_in_cents: amountCentavos,
          currency: "COP",
          customer_email: customerEmail,
          payment_method: { type: "NEQUI", phone_number: phoneNumber },
          reference,
          acceptance_token: acceptanceToken,
        };
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
          body: JSON.stringify(wompiBody),
        });
        const wompiData = await wompiRes.json() as { data?: { id: string }; error?: unknown };
        if (!wompiRes.ok || !wompiData.data) {
          res.status(502).json({ error: "No se pudo iniciar el pago Nequi. Verifica el número y vuelve a intentar." });
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
            user_legal_id_type: userLegalIdType ?? "CC",
            user_legal_id: userLegalId!,
            financial_institution_code: bankCode,
            payment_description: "Recarga pulsera evento",
          },
          reference,
          acceptance_token: acceptanceToken,
          redirect_url: `${process.env.APP_URL ?? "https://example.com"}/payment-return`,
        };
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
          body: JSON.stringify(wompiBody),
        });
        const wompiData = await wompiRes.json() as { data?: { id: string; payment_method?: { extra?: { async_payment_url?: string } } }; error?: unknown };
        if (!wompiRes.ok || !wompiData.data) {
          res.status(502).json({ error: "No se pudo iniciar el pago PSE. Vuelve a intentar." });
          return;
        }
        wompiTransactionId = wompiData.data.id;
        redirectUrl = wompiData.data.payment_method?.extra?.async_payment_url;
      }
    } catch {
      res.status(502).json({ error: "Pasarela de pago no disponible. Intenta más tarde." });
      return;
    }

    const [intent] = await db
      .insert(wompiPaymentIntentsTable)
      .values({
        braceletUid: uid,
        amount,
        paymentMethod,
        phoneNumber,
        bankCode,
        wompiTransactionId,
        wompiReference: reference,
        redirectUrl,
        status: "pending",
        selfService: true,
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
  "/public/topup/status/:intentId",
  async (req: Request, res: Response) => {
    const { intentId } = req.params as { intentId: string };
    const [intent] = await db
      .select()
      .from(wompiPaymentIntentsTable)
      .where(and(eq(wompiPaymentIntentsTable.id, intentId), eq(wompiPaymentIntentsTable.selfService, true)));

    if (!intent) {
      res.status(404).json({ error: "Intent not found" });
      return;
    }

    if ((intent.status === "pending" || intent.status === "processing") && intent.wompiTransactionId && WOMPI_PRIVATE_KEY) {
      try {
        const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${intent.wompiTransactionId}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const wompiData = await wompiRes.json() as { data?: { status: string } };
        if (wompiRes.ok && wompiData.data) {
          const wompiStatus = wompiData.data.status;
          if (wompiStatus === "APPROVED") {
            await processSelfServicePayment(intent.id, intent.wompiTransactionId!);
            const [updated] = await db.select().from(wompiPaymentIntentsTable).where(eq(wompiPaymentIntentsTable.id, intentId));
            res.json({ intentId: updated.id, status: updated.status });
            return;
          } else if (["DECLINED", "ERROR", "VOIDED"].includes(wompiStatus)) {
            await db.update(wompiPaymentIntentsTable)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(wompiPaymentIntentsTable.id, intentId));
            res.json({ intentId, status: "failed" });
            return;
          }
        }
      } catch {
      }
    }

    const clientStatus = intent.status === "processing" ? "pending" : intent.status;
    res.json({ intentId: intent.id, status: clientStatus });
  },
);

export async function processSelfServicePayment(intentId: string, wompiTransactionId: string) {
  let notifyBraceletUid: string | null = null;
  let notifyAmount = 0;
  let notifyNewBalance = 0;

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(
        eq(wompiPaymentIntentsTable.id, intentId),
        eq(wompiPaymentIntentsTable.status, "pending"),
      ))
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
        .values({ nfcUid: intent.braceletUid, lastKnownBalance: 0, lastCounter: 0 })
        .returning();
      bracelet = created;
    }

    const newBalance = bracelet.lastKnownBalance + intent.amount;
    const newCounter = bracelet.lastCounter + 1;

    const [topUp] = await tx
      .insert(topUpsTable)
      .values({
        braceletUid: intent.braceletUid,
        amount: intent.amount,
        paymentMethod: intent.paymentMethod,
        performedByUserId: intent.performedByUserId ?? "self-service",
        wompiTransactionId,
        status: "completed",
        newBalance: newBalance,
        newCounter,
      })
      .returning();

    await tx
      .update(braceletsTable)
      .set({
        lastKnownBalance: newBalance,
        lastCounter: newCounter,
        pendingSync: true,
        pendingBalance: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(braceletsTable.nfcUid, intent.braceletUid));

    await tx
      .update(wompiPaymentIntentsTable)
      .set({ status: "success", topUpId: topUp.id, updatedAt: new Date() })
      .where(eq(wompiPaymentIntentsTable.id, intentId));

    notifyBraceletUid = intent.braceletUid;
    notifyAmount = intent.amount;
    notifyNewBalance = newBalance;
  });

  if (notifyBraceletUid) {
    const [sb] = await db.select({ eventId: braceletsTable.eventId }).from(braceletsTable).where(eq(braceletsTable.nfcUid, notifyBraceletUid)).limit(1);
    let scc = "COP";
    if (sb?.eventId) { const [se] = await db.select({ currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, sb.eventId)).limit(1); if (se) scc = se.currencyCode; }
    void notifyTopUpSuccess(notifyBraceletUid, notifyAmount, notifyNewBalance, scc).catch(() => {});
  }
}

const registerAttendeeSchema = z.object({
  braceletUid: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

router.post(
  "/public/register-attendee",
  async (req: Request, res: Response) => {
    const parsed = registerAttendeeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
      return;
    }

    const { braceletUid, email, password, firstName, lastName } = parsed.data;
    const uid = normalizeUid(braceletUid);
    if (!uid) {
      res.status(400).json({ error: "braceletUid must be a valid hex UID" });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();

    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail));

    if (existingUser) {
      res.status(409).json({ error: "EMAIL_TAKEN", message: "Este correo ya está registrado. Inicia sesión en la app." });
      return;
    }

    const [bracelet] = await db
      .select({ nfcUid: braceletsTable.nfcUid, attendeeUserId: braceletsTable.attendeeUserId })
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, uid));

    if (!bracelet) {
      res.status(404).json({ error: "BRACELET_NOT_FOUND", message: "Pulsera no encontrada." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(usersTable)
        .values({
          email: normalizedEmail,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          passwordHash,
          role: "attendee",
        })
        .returning({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName });

      await tx
        .update(braceletsTable)
        .set({
          attendeeUserId: newUser.id,
          attendeeName: firstName ? `${firstName}${lastName ? ` ${lastName}` : ""}` : null,
          email: normalizedEmail,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(braceletsTable.nfcUid, uid),
            isNull(braceletsTable.attendeeUserId),
          ),
        );

      res.status(201).json({
        success: true,
        userId: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        message: "Cuenta creada exitosamente. Ya puedes iniciar sesión en Tapee.",
      });
    });
  },
);

export default router;

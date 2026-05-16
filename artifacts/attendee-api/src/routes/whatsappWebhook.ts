import { Router, type IRouter, type Request, type Response } from "express";
import { db, pendingWhatsappDocumentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendWhatsAppDocument } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import { buildOrderPdfUrl } from "./tickets";

const router: IRouter = Router();

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (/^\d{10}$/.test(cleaned)) cleaned = `57${cleaned}`;
  return cleaned;
}

function isTicketDocumentRequest(body: Record<string, unknown>): boolean {
  const type = body?.type as string | undefined;
  const data = body?.data as Record<string, unknown> | undefined;

  if (type === "button") {
    const title = ((data?.title as string) || "").toLowerCase().trim();
    if (title.includes("env") && title.includes("aqu")) return true;
    // Accept any button reply as a trigger
    return true;
  }

  if (type === "interactive") {
    const listReply = data?.listReply as Record<string, unknown> | undefined;
    const title = ((listReply?.title as string) || "").toLowerCase().trim();
    if (title.includes("env") && title.includes("aqu")) return true;
    return true;
  }

  if (type === "text") {
    const text = ((body?.text as string) || "").toLowerCase().trim();
    if (text.includes("env") && text.includes("aqu")) return true;
    if (text.includes("ticket") || text.includes("entrada")) return true;
  }

  return false;
}

function extractSenderPhone(body: Record<string, unknown>): string | undefined {
  // WATI primary field
  const waId = body?.waId as string | undefined;
  if (waId) return waId;

  // Fallback: messageContact object
  const contact = body?.messageContact as Record<string, unknown> | undefined;
  if (contact?.wa_id) return contact.wa_id as string;
  if (contact?.phone) return (contact.phone as string).replace(/^\+/, "");

  return undefined;
}

// GET — WATI and other providers may verify the endpoint with a GET request
router.get("/whatsapp/webhook", (req: Request, res: Response) => {
  logger.info({ query: req.query }, "WhatsApp webhook GET verification request received");
  const challenge = req.query.challenge || req.query["hub.challenge"];
  if (challenge) {
    res.status(200).send(String(challenge));
  } else {
    res.status(200).json({ status: "ok", service: "tapee-whatsapp-webhook" });
  }
});

// POST — receives inbound WhatsApp messages from WATI
router.post("/whatsapp/webhook", async (req: Request, res: Response) => {
  // Respond 200 immediately so WATI doesn't retry
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body;
    logger.info({ webhookBody: JSON.stringify(body) }, "WhatsApp webhook POST received");

    // WATI sends eventType for all events; only process inbound messages
    const eventType = body?.eventType as string | undefined;
    if (eventType && eventType !== "inboundMessage") {
      logger.info({ eventType }, "WhatsApp webhook: ignoring non-inbound event");
      return;
    }

    const senderPhone = extractSenderPhone(body);

    if (!senderPhone) {
      logger.warn({ body: JSON.stringify(body).slice(0, 500) }, "WhatsApp webhook: could not extract sender phone");
      return;
    }

    const normalized = normalizePhone(senderPhone);
    logger.info({ phone: normalized, eventType, isDocRequest: isTicketDocumentRequest(body) }, "Inbound WhatsApp message");

    if (!isTicketDocumentRequest(body)) {
      logger.info({ phone: normalized, type: body?.type }, "Message is not a ticket document request — ignoring");
      return;
    }

    const pendingDocs = await db
      .select()
      .from(pendingWhatsappDocumentsTable)
      .where(
        and(
          eq(pendingWhatsappDocumentsTable.phone, normalized),
          eq(pendingWhatsappDocumentsTable.status, "pending"),
        ),
      );

    if (pendingDocs.length === 0) {
      logger.info({ phone: normalized }, "No pending documents for this phone");
      return;
    }

    logger.info({ phone: normalized, count: pendingDocs.length }, "Sending pending documents after user button reply");

    for (const doc of pendingDocs) {
      try {
        const publicPdfUrl = buildOrderPdfUrl(doc.orderId);
        logger.info({ orderId: doc.orderId, url: publicPdfUrl }, "Using signed PDF URL for WhatsApp delivery");

        const ticketLabel = doc.ticketCount === 1
          ? `Entrada para ${doc.eventName} - ${doc.attendeeName}`
          : `${doc.ticketCount} entradas para ${doc.eventName}`;

        const logContext = {
          triggerType: "ticket_document",
          orderId: doc.orderId,
          attendeeName: doc.attendeeName,
        };

        const sent = await sendWhatsAppDocument(
          normalized,
          publicPdfUrl,
          doc.filename,
          ticketLabel,
          logContext,
        );

        await db
          .update(pendingWhatsappDocumentsTable)
          .set({
            status: sent ? "sent" : "failed",
            pdfUrl: publicPdfUrl,
            updatedAt: new Date(),
          })
          .where(eq(pendingWhatsappDocumentsTable.id, doc.id));

        logger.info({ phone: normalized, orderId: doc.orderId, sent, pdfUrl: publicPdfUrl }, "Processed pending document");
      } catch (err) {
        logger.error({ err, orderId: doc.orderId }, "Error processing individual pending document");
        await db
          .update(pendingWhatsappDocumentsTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(pendingWhatsappDocumentsTable.id, doc.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Error processing inbound WhatsApp webhook");
  }
});

export default router;

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
  const payload = body?.payload as Record<string, unknown> | undefined;
  if (!payload) return false;

  const msgType = payload.type as string | undefined;
  const inner = payload.payload as Record<string, unknown> | undefined;

  if (msgType === "button_reply" || msgType === "quick_reply") {
    const title = (inner?.title as string || "").toLowerCase().trim();
    if (title.includes("env") && title.includes("aqu")) return true;
    // Accept any button reply as a trigger — some Gupshup versions omit the title
    return true;
  }

  if (msgType === "text") {
    const text = (inner?.text as string || inner as unknown as string || "").toLowerCase().trim();
    if (text.includes("env") && text.includes("aqu")) return true;
    if (text.includes("ticket") || text.includes("entrada")) return true;
  }

  return false;
}

function extractSenderPhone(body: Record<string, unknown>): string | undefined {
  const payload = body?.payload as Record<string, unknown> | undefined;
  if (!payload) return undefined;

  // Gupshup "message" type
  const source = payload.source as string | undefined;
  if (source) return source;

  // Nested sender object
  const sender = payload.sender as Record<string, unknown> | undefined;
  if (sender?.phone) return sender.phone as string;
  if (sender?.id) return sender.id as string;

  // Some Gupshup formats put it at top level
  const topSource = body.source as string | undefined;
  if (topSource) return topSource;

  return undefined;
}

// GET handler — Gupshup and other webhook providers may send a GET to verify the endpoint
router.get("/whatsapp/webhook", (req: Request, res: Response) => {
  logger.info({ query: req.query }, "WhatsApp webhook GET verification request received");
  // Return 200 with any challenge parameter if present
  const challenge = req.query.challenge || req.query["hub.challenge"];
  if (challenge) {
    res.status(200).send(String(challenge));
  } else {
    res.status(200).json({ status: "ok", service: "tapee-whatsapp-webhook" });
  }
});

// POST handler — receives inbound WhatsApp messages from Gupshup
router.post("/whatsapp/webhook", async (req: Request, res: Response) => {
  // Always respond 200 immediately so Gupshup doesn't retry
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body;
    // Log the FULL payload so we can debug what Gupshup is sending
    logger.info({ webhookBody: JSON.stringify(body) }, "WhatsApp webhook POST received");

    const type = body?.type as string | undefined;

    if (!type) {
      logger.warn("WhatsApp webhook: no 'type' field in body — ignoring");
      return;
    }

    if (type !== "message" && type !== "message-event") {
      logger.info({ type }, "WhatsApp webhook: ignoring non-message event type");
      return;
    }

    const senderPhone = extractSenderPhone(body);

    if (!senderPhone) {
      logger.warn({ body: JSON.stringify(body).slice(0, 500) }, "WhatsApp webhook: could not extract sender phone");
      return;
    }

    const normalized = normalizePhone(senderPhone);
    logger.info({ phone: normalized, type, isDocRequest: isTicketDocumentRequest(body) }, "Inbound WhatsApp message");

    if (!isTicketDocumentRequest(body)) {
      logger.info({ phone: normalized, type, msgType: (body?.payload as Record<string, unknown>)?.type }, "Message is not a ticket document request — ignoring");
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

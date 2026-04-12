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
  }

  if (msgType === "text") {
    const text = (inner?.text as string || inner as unknown as string || "").toLowerCase().trim();
    if (text.includes("env") && text.includes("aqu")) return true;
  }

  return false;
}

router.post("/whatsapp/webhook", async (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body;
    logger.info({ webhookBody: JSON.stringify(body).slice(0, 1000) }, "Raw WhatsApp webhook payload");

    const type = body?.type;

    if (type !== "message" && type !== "message-event") return;

    let senderPhone: string | undefined;

    if (type === "message") {
      senderPhone = body?.payload?.source || body?.payload?.sender?.phone;
    }

    if (!senderPhone) return;

    const normalized = normalizePhone(senderPhone);
    logger.info({ phone: normalized, isDocRequest: isTicketDocumentRequest(body) }, "Inbound WhatsApp message received");

    if (!isTicketDocumentRequest(body)) {
      logger.info({ phone: normalized }, "Message is not a ticket document request — ignoring");
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

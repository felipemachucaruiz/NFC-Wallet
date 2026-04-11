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
    logger.info({ phone: normalized }, "Inbound WhatsApp message received");

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

    logger.info({ phone: normalized, count: pendingDocs.length }, "Sending pending documents after user reply");

    for (const doc of pendingDocs) {
      const freshPdfUrl = buildOrderPdfUrl(doc.orderId);

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
        freshPdfUrl,
        doc.filename,
        ticketLabel,
        logContext,
      );

      await db
        .update(pendingWhatsappDocumentsTable)
        .set({
          status: sent ? "sent" : "failed",
          pdfUrl: freshPdfUrl,
          updatedAt: new Date(),
        })
        .where(eq(pendingWhatsappDocumentsTable.id, doc.id));

      logger.info({ phone: normalized, orderId: doc.orderId, sent }, "Processed pending document");
    }
  } catch (err) {
    logger.error({ err }, "Error processing inbound WhatsApp webhook");
  }
});

export default router;

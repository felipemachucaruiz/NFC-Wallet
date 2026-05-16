import { logger } from "./logger";
import { db, whatsappMessageLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const WATI_API_KEY = process.env.WATI_API_KEY;
const WATI_API_URL = process.env.WATI_API_URL?.replace(/\/$/, ""); // e.g. https://app-server.wati.io

function isConfigured(): boolean {
  return !!(WATI_API_KEY && WATI_API_URL);
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (/^\d{10}$/.test(cleaned)) cleaned = `57${cleaned}`;
  return cleaned;
}

export interface MessageLogContext {
  triggerType?: string;
  templateName?: string;
  orderId?: string;
  ticketId?: string;
  eventId?: string;
  attendeeName?: string;
}

async function logMessage(
  destination: string,
  messageType: "template" | "text" | "document" | "image",
  status: "sent" | "failed" | "pending",
  payload: Record<string, unknown>,
  context?: MessageLogContext,
  errorMessage?: string,
  watiMessageId?: string,
): Promise<string | null> {
  try {
    const [row] = await db.insert(whatsappMessageLogTable).values({
      destination: normalizePhone(destination),
      messageType,
      templateId: (payload.templateId as string) || null,
      templateName: context?.templateName || null,
      triggerType: context?.triggerType || null,
      status,
      errorMessage: errorMessage || null,
      payload,
      orderId: context?.orderId || null,
      ticketId: context?.ticketId || null,
      eventId: context?.eventId || null,
      attendeeName: context?.attendeeName || null,
      gupshupMessageId: watiMessageId || null,
    }).returning();
    return row?.id || null;
  } catch (err) {
    logger.error({ err }, "Failed to log WhatsApp message");
    return null;
  }
}

async function updateLogStatus(
  logId: string,
  status: "sent" | "failed",
  errorMessage?: string,
  watiMessageId?: string,
): Promise<void> {
  try {
    await db.update(whatsappMessageLogTable)
      .set({
        status,
        errorMessage: errorMessage || null,
        gupshupMessageId: watiMessageId || null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessageLogTable.id, logId));
  } catch (err) {
    logger.error({ err }, "Failed to update WhatsApp message log");
  }
}

let _currentLogContext: MessageLogContext | undefined;

export function setMessageLogContext(context: MessageLogContext) {
  _currentLogContext = context;
}

export function clearMessageLogContext() {
  _currentLogContext = undefined;
}

async function sendWatiTemplateMessage(
  destination: string,
  templateName: string,
  params: Array<{ name: string; value: string }>,
  logContext?: MessageLogContext,
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("WATI WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);
  const ctx = logContext || _currentLogContext;

  const logId = await logMessage(
    destination,
    "template",
    "pending",
    { templateName, params },
    ctx,
  );

  try {
    const res = await fetch(
      `${WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${phone}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WATI_API_KEY}`,
        },
        body: JSON.stringify({
          template_name: templateName,
          broadcast_name: templateName,
          parameters: params,
        }),
      },
    );

    const responseText = await res.text();

    if (!res.ok) {
      logger.error({ status: res.status, body: responseText, templateName }, "WATI template send failed");
      if (logId) await updateLogStatus(logId, "failed", responseText);
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.result === false) {
      logger.error({ response: parsed, templateName }, "WATI template returned error");
      if (logId) await updateLogStatus(logId, "failed", (parsed.info as string) || JSON.stringify(parsed));
      return false;
    }

    logger.info({ destination: phone, templateName }, "WhatsApp template sent successfully");
    if (logId) await updateLogStatus(logId, "sent", undefined, parsed.id as string);
    return true;
  } catch (err) {
    logger.error({ err, templateName }, "WATI template send error");
    if (logId) await updateLogStatus(logId, "failed", (err as Error).message);
    return false;
  }
}

async function sendWatiSessionText(
  destination: string,
  text: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("WATI WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);
  const ctx = logContext || _currentLogContext;
  const logId = await logMessage(destination, "text", "pending", { type: "text", text }, ctx);

  const formData = new FormData();
  formData.append("messageText", text);

  try {
    const res = await fetch(
      `${WATI_API_URL}/api/v1/sendSessionMessage/${phone}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${WATI_API_KEY}` },
        body: formData,
      },
    );

    const responseText = await res.text();

    if (!res.ok) {
      logger.error({ status: res.status, body: responseText }, "WATI session message send failed");
      if (logId) await updateLogStatus(logId, "failed", responseText);
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.result === false) {
      logger.error({ response: parsed }, "WATI session message returned error");
      if (logId) await updateLogStatus(logId, "failed", (parsed.info as string) || JSON.stringify(parsed));
      return false;
    }

    logger.info({ destination: phone }, "WhatsApp session message sent successfully");
    if (logId) await updateLogStatus(logId, "sent", undefined, parsed.id as string);
    return true;
  } catch (err) {
    logger.error({ err }, "WATI session message send error");
    if (logId) await updateLogStatus(logId, "failed", (err as Error).message);
    return false;
  }
}

async function sendWatiSessionFile(
  destination: string,
  fileUrl: string,
  filename: string,
  mimeType: string,
  messageType: "document" | "image",
  caption?: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("WATI WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);
  const ctx = logContext || _currentLogContext;
  const logId = await logMessage(destination, messageType, "pending", { type: messageType, url: fileUrl, filename, caption }, ctx);

  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      logger.error({ status: fileRes.status, url: fileUrl }, "Failed to download file for WATI send");
      if (logId) await updateLogStatus(logId, "failed", `Failed to download: HTTP ${fileRes.status}`);
      return false;
    }

    const fileBuffer = await fileRes.arrayBuffer();
    const blob = new Blob([fileBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, filename);
    if (caption) formData.append("caption", caption);

    const res = await fetch(
      `${WATI_API_URL}/api/v1/sendSessionFile/${phone}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${WATI_API_KEY}` },
        body: formData,
      },
    );

    const responseText = await res.text();

    if (!res.ok) {
      logger.error({ status: res.status, body: responseText, filename }, "WATI file send failed");
      if (logId) await updateLogStatus(logId, "failed", responseText);
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.result === false) {
      logger.error({ response: parsed, filename }, "WATI file send returned error");
      if (logId) await updateLogStatus(logId, "failed", (parsed.info as string) || JSON.stringify(parsed));
      return false;
    }

    logger.info({ destination: phone, filename, messageType }, "WhatsApp file sent successfully via WATI");
    if (logId) await updateLogStatus(logId, "sent", undefined, parsed.id as string);
    return true;
  } catch (err) {
    logger.error({ err, filename }, "WATI file send error");
    if (logId) await updateLogStatus(logId, "failed", (err as Error).message);
    return false;
  }
}

export async function sendWhatsAppText(
  destination: string,
  text: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  return sendWatiSessionText(destination, text, logContext);
}

export interface TemplateParam {
  type: "text";
  text: string;
}

export async function sendWhatsAppTemplate(
  destination: string,
  templateName: string,
  params: TemplateParam[],
  _isAuthentication?: boolean,
  logContext?: MessageLogContext,
): Promise<boolean> {
  const watiParams = params.map((p, i) => ({ name: String(i + 1), value: p.text }));
  return sendWatiTemplateMessage(destination, templateName, watiParams, logContext);
}

export async function sendWhatsAppDocument(
  destination: string,
  documentUrl: string,
  filename: string,
  caption?: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  return sendWatiSessionFile(destination, documentUrl, filename, "application/pdf", "document", caption, logContext);
}

export async function sendWhatsAppImage(
  destination: string,
  imageUrl: string,
  caption?: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  const ext = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  const mime = mimeMap[ext] ?? "image/jpeg";
  const filename = `image.${ext}`;
  return sendWatiSessionFile(destination, imageUrl, filename, mime, "image", caption, logContext);
}

export function isWhatsAppConfigured(): boolean {
  return isConfigured();
}

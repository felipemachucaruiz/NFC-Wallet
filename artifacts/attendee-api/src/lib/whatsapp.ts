import { logger } from "./logger";
import { db, whatsappMessageLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY;
const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME;
const GUPSHUP_SOURCE = process.env.GUPSHUP_SOURCE_NUMBER;
const GUPSHUP_MSG_URL = "https://api.gupshup.io/wa/api/v1/msg";
const GUPSHUP_TEMPLATE_URL = "https://api.gupshup.io/wa/api/v1/template/msg";

function isConfigured(): boolean {
  return !!(GUPSHUP_API_KEY && GUPSHUP_APP_NAME && GUPSHUP_SOURCE);
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
  gupshupMessageId?: string,
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
      gupshupMessageId: gupshupMessageId || null,
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
  gupshupMessageId?: string,
): Promise<void> {
  try {
    await db.update(whatsappMessageLogTable)
      .set({
        status,
        errorMessage: errorMessage || null,
        gupshupMessageId: gupshupMessageId || null,
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

async function sendGupshupSessionMessage(
  destination: string,
  message: Record<string, unknown>,
  logContext?: MessageLogContext,
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("Gupshup WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);
  const ctx = logContext || _currentLogContext;
  const msgType = (message.type as string) === "file" ? "document" : (message.type as "text" | "image") || "text";

  const logId = await logMessage(destination, msgType, "pending", message, ctx);

  const body = new URLSearchParams();
  body.append("channel", "whatsapp");
  body.append("source", GUPSHUP_SOURCE!);
  body.append("destination", phone);
  body.append("message", JSON.stringify(message));
  body.append("src.name", GUPSHUP_APP_NAME!);

  try {
    const res = await fetch(GUPSHUP_MSG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: GUPSHUP_API_KEY!,
      },
      body: body.toString(),
    });

    const responseText = await res.text();

    if (!res.ok) {
      logger.error({ status: res.status, body: responseText }, "Gupshup session message send failed");
      if (logId) await updateLogStatus(logId, "failed", responseText);
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.status === "error") {
      logger.error({ response: parsed }, "Gupshup session message returned error");
      if (logId) await updateLogStatus(logId, "failed", parsed.message as string);
      return false;
    }

    logger.info({ destination: phone, messageType: message.type }, "WhatsApp session message sent successfully");
    if (logId) await updateLogStatus(logId, "sent", undefined, parsed.messageId as string);
    return true;
  } catch (err) {
    logger.error({ err }, "Gupshup session message send error");
    if (logId) await updateLogStatus(logId, "failed", (err as Error).message);
    return false;
  }
}

async function sendGupshupTemplateMessage(
  destination: string,
  templateId: string,
  params: string[],
  logContext?: MessageLogContext,
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("Gupshup WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);
  const ctx = logContext || _currentLogContext;

  const templatePayload = { id: templateId, params };
  const logId = await logMessage(
    destination,
    "template",
    "pending",
    { templateId, params },
    ctx,
  );

  const body = new URLSearchParams();
  body.append("channel", "whatsapp");
  body.append("source", GUPSHUP_SOURCE!);
  body.append("destination", phone);
  body.append("template", JSON.stringify(templatePayload));
  body.append("src.name", GUPSHUP_APP_NAME!);

  try {
    const res = await fetch(GUPSHUP_TEMPLATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: GUPSHUP_API_KEY!,
      },
      body: body.toString(),
    });

    const responseText = await res.text();

    if (!res.ok) {
      logger.error({ status: res.status, body: responseText, templateId }, "Gupshup template send failed");
      if (logId) await updateLogStatus(logId, "failed", responseText);
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.status === "error") {
      logger.error({ response: parsed, templateId }, "Gupshup template returned error");
      if (logId) await updateLogStatus(logId, "failed", parsed.message as string);
      return false;
    }

    logger.info({ destination: phone, templateId }, "WhatsApp template sent successfully");
    if (logId) await updateLogStatus(logId, "sent", undefined, parsed.messageId as string);
    return true;
  } catch (err) {
    logger.error({ err, templateId }, "Gupshup template send error");
    if (logId) await updateLogStatus(logId, "failed", (err as Error).message);
    return false;
  }
}

export async function sendWhatsAppText(
  destination: string,
  text: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  return sendGupshupSessionMessage(destination, { type: "text", text }, logContext);
}

export interface TemplateParam {
  type: "text";
  text: string;
}

export async function sendWhatsAppTemplate(
  destination: string,
  templateId: string,
  params: TemplateParam[],
  isAuthentication?: boolean,
  logContext?: MessageLogContext,
): Promise<boolean> {
  const paramStrings = params.map((p) => p.text);

  if (isAuthentication) {
    const otpCode = paramStrings[0] || "";
    return sendGupshupTemplateMessage(destination, templateId, [otpCode, otpCode], logContext);
  }

  return sendGupshupTemplateMessage(destination, templateId, paramStrings, logContext);
}

export async function sendWhatsAppDocument(
  destination: string,
  documentUrl: string,
  filename: string,
  caption?: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  return sendGupshupSessionMessage(destination, {
    type: "file",
    url: documentUrl,
    filename,
    caption: caption || "",
  }, logContext);
}

export async function sendWhatsAppImage(
  destination: string,
  imageUrl: string,
  caption?: string,
  logContext?: MessageLogContext,
): Promise<boolean> {
  return sendGupshupSessionMessage(destination, {
    type: "image",
    originalUrl: imageUrl,
    previewUrl: imageUrl,
    caption: caption || "",
  }, logContext);
}

export function isWhatsAppConfigured(): boolean {
  return isConfigured();
}

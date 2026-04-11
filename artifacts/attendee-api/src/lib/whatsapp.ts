import { logger } from "./logger";

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

async function sendGupshupSessionMessage(destination: string, message: Record<string, unknown>): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("Gupshup WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);

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
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.status === "error") {
      logger.error({ response: parsed }, "Gupshup session message returned error");
      return false;
    }

    logger.info({ destination: phone, messageType: message.type }, "WhatsApp session message sent successfully");
    return true;
  } catch (err) {
    logger.error({ err }, "Gupshup session message send error");
    return false;
  }
}

async function sendGupshupTemplateMessage(
  destination: string,
  templateId: string,
  params: string[],
): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("Gupshup WhatsApp not configured — skipping send");
    return false;
  }

  const phone = normalizePhone(destination);

  const templatePayload = {
    id: templateId,
    params,
  };

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
      return false;
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed.status === "error") {
      logger.error({ response: parsed, templateId }, "Gupshup template returned error");
      return false;
    }

    logger.info({ destination: phone, templateId }, "WhatsApp template sent successfully");
    return true;
  } catch (err) {
    logger.error({ err, templateId }, "Gupshup template send error");
    return false;
  }
}

export async function sendWhatsAppText(destination: string, text: string): Promise<boolean> {
  return sendGupshupSessionMessage(destination, {
    type: "text",
    text,
  });
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
): Promise<boolean> {
  const paramStrings = params.map((p) => p.text);

  if (isAuthentication) {
    const otpCode = paramStrings[0] || "";
    return sendGupshupTemplateMessage(destination, templateId, [otpCode, otpCode]);
  }

  return sendGupshupTemplateMessage(destination, templateId, paramStrings);
}

export async function sendWhatsAppDocument(
  destination: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<boolean> {
  return sendGupshupSessionMessage(destination, {
    type: "file",
    url: documentUrl,
    filename,
    caption: caption || "",
  });
}

export async function sendWhatsAppImage(
  destination: string,
  imageUrl: string,
  caption?: string,
): Promise<boolean> {
  return sendGupshupSessionMessage(destination, {
    type: "image",
    originalUrl: imageUrl,
    previewUrl: imageUrl,
    caption: caption || "",
  });
}

export function isWhatsAppConfigured(): boolean {
  return isConfigured();
}

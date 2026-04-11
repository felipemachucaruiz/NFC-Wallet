import { sendEmail, getAppUrl, type InlineImage } from "./email";
import { logger } from "./logger";
import QRCode from "qrcode";

const APP_URL = process.env.APP_URL ?? "";

function getLogoUrl(): string {
  const base = process.env.LOGO_URL ?? "";
  if (base) return base;
  if (APP_URL) return `${APP_URL}/api/static/tapee-logo.png`;
  return "";
}

function getLogoImg(): string {
  const url = getLogoUrl();
  if (url) {
    return `<img src="${url}" alt="Tapee" width="140" style="display:block;margin:0 auto 8px;" />`;
  }
  return `<h1 style="color: #00f1ff; font-size: 28px; margin: 0 0 8px;">Tapee</h1>`;
}

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; color: #1a1a1a; margin: 0; padding: 0;">
  <div style="max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7;">
    <div style="background: linear-gradient(135deg, #0a0a0a, #111827); padding: 32px 32px 24px; text-align: center;">
      ${getLogoImg()}
      <p style="color: #8b949e; margin: 0; font-size: 14px;">Eventos &middot; Ticketing</p>
    </div>
    <div style="padding: 32px;">
      ${body}
    </div>
    <div style="padding: 16px 32px; background: #f4f4f5; text-align: center; border-top: 1px solid #e4e4e7;">
      <p style="color: #71717a; font-size: 12px; margin: 0;">&copy; Tapee &middot; Eventos</p>
    </div>
  </div>
</body>
</html>`;
}

interface TicketEmailData {
  attendeeName: string;
  attendeeEmail: string;
  eventName: string;
  eventDates: string[];
  venueName: string;
  venueAddress: string;
  sectionName: string;
  ticketTypeName: string;
  validDays: string[];
  qrCodeToken: string;
  ticketId: string;
  orderId: string;
  locale?: string;
  hasAccount?: boolean;
}

export async function sendTicketConfirmationEmail(data: TicketEmailData): Promise<boolean> {
  const isEs = (data.locale ?? "es").startsWith("es");
  const appUrl = getAppUrl() || APP_URL;

  const subject = isEs
    ? `Tu entrada para ${data.eventName}`
    : `Your ticket for ${data.eventName}`;

  const greeting = isEs
    ? `Hola ${data.attendeeName},`
    : `Hi ${data.attendeeName},`;

  const intro = isEs
    ? "Tu entrada ha sido confirmada. Presenta el código QR de abajo en la puerta del evento."
    : "Your ticket has been confirmed. Present the QR code below at the event gate.";

  const eventLabel = isEs ? "Evento" : "Event";
  const venueLabel = isEs ? "Lugar" : "Venue";
  const sectionLabel = isEs ? "Sección" : "Section";
  const typeLabel = isEs ? "Tipo" : "Type";
  const daysLabel = isEs ? "Días válidos" : "Valid days";
  const orderLabel = isEs ? "Orden" : "Order";
  const qrLabel = isEs ? "Tu código QR" : "Your QR Code";
  const qrInstructions = isEs
    ? "Presenta este código QR en la puerta del evento. También puedes ver tu entrada en la app de Tapee."
    : "Present this QR code at the event gate. You can also view your ticket in the Tapee app.";
  const walletLabel = isEs ? "Agrega a tu billetera" : "Add to your wallet";

  const appleWalletUrl = `${appUrl}/api/tickets/${data.ticketId}/wallet/apple`;
  const googleWalletUrl = `${appUrl}/api/tickets/${data.ticketId}/wallet/google`;

  let qrBase64 = "";
  const inlineImages: InlineImage[] = [];
  try {
    const qrBuffer = await QRCode.toBuffer(data.qrCodeToken, {
      width: 250,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
      type: "png",
    });
    qrBase64 = qrBuffer.toString("base64");
    inlineImages.push({ name: "qrcode.png", content: qrBase64 });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR code for email");
  }

  const validDaysList = data.validDays.length > 0
    ? data.validDays.join(", ")
    : (isEs ? "Todos los días" : "All days");

  const qrImageHtml = qrBase64
    ? `<img src="cid:qrcode.png" alt="QR Code" width="250" height="250" style="display:block;margin:0 auto 12px;border-radius:8px;" />`
    : `<p style="color: #ef4444; font-size: 14px; margin: 0 0 8px;">${isEs ? "No se pudo generar el código QR. Usa la app de Tapee." : "QR code could not be generated. Use the Tapee app."}</p>`;

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Entrada Confirmada" : "Ticket Confirmed"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${eventLabel}</td><td style="color: #1a1a1a; padding: 4px 0; font-weight: 600; text-align: right;">${escapeHtml(data.eventName)}</td></tr>
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${venueLabel}</td><td style="color: #1a1a1a; padding: 4px 0; text-align: right;">${escapeHtml(data.venueName)}</td></tr>
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${sectionLabel}</td><td style="color: #1a1a1a; padding: 4px 0; text-align: right;">${escapeHtml(data.sectionName)}</td></tr>
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${typeLabel}</td><td style="color: #1a1a1a; padding: 4px 0; text-align: right;">${escapeHtml(data.ticketTypeName)}</td></tr>
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${daysLabel}</td><td style="color: #1a1a1a; padding: 4px 0; text-align: right;">${escapeHtml(validDaysList)}</td></tr>
        <tr><td style="color: #71717a; padding: 4px 0; font-size: 13px;">${orderLabel}</td><td style="color: #1a1a1a; padding: 4px 0; text-align: right; font-family: monospace; font-size: 12px;">${data.orderId.slice(0, 8)}</td></tr>
      </table>
    </div>

    <div style="text-align: center; margin: 24px 0; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 24px 16px;">
      <p style="color: #1a1a1a; font-weight: 600; margin: 0 0 16px;">📱 ${qrLabel}</p>
      ${qrImageHtml}
      <p style="color: #52525b; font-size: 13px; margin: 0;">${qrInstructions}</p>
    </div>

    ${data.hasAccount ? `<div style="text-align: center; margin: 24px 0;">
      <p style="color: #71717a; font-size: 13px; margin: 0 0 12px;">${walletLabel}</p>
      <a href="${appleWalletUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; font-weight: bold; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin: 4px;">🍎 Apple Wallet</a>
      <a href="${googleWalletUrl}" style="display: inline-block; background-color: #4285f4; color: #ffffff; font-weight: bold; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin: 4px;">📱 Google Wallet</a>
    </div>` : `<div style="text-align: center; margin: 24px 0;">
      <p style="color: #71717a; font-size: 13px; margin: 0;">${isEs ? "Crea tu cuenta en Tapee para agregar tu entrada a Apple Wallet o Google Wallet." : "Create your Tapee account to add your ticket to Apple Wallet or Google Wallet."}</p>
    </div>`}
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${intro}\n\nEvento: ${data.eventName}\nLugar: ${data.venueName}\nSección: ${data.sectionName}\nTipo: ${data.ticketTypeName}\nDías válidos: ${validDaysList}\nOrden: ${data.orderId}\n\n— El equipo de Tapee`
    : `${greeting}\n\n${intro}\n\nEvent: ${data.eventName}\nVenue: ${data.venueName}\nSection: ${data.sectionName}\nType: ${data.ticketTypeName}\nValid days: ${validDaysList}\nOrder: ${data.orderId}\n\n— The Tapee team`;

  return sendEmail({
    to: data.attendeeEmail,
    toName: data.attendeeName,
    subject,
    htmlContent,
    textContent,
    inlineImages,
  });
}

interface InvitationEmailData {
  attendeeName: string;
  attendeeEmail: string;
  eventName: string;
  buyerName: string;
  locale?: string;
}

export async function sendTicketInvitationEmail(data: InvitationEmailData): Promise<boolean> {
  const isEs = (data.locale ?? "es").startsWith("es");
  const appUrl = getAppUrl() || APP_URL;
  const claimUrl = `${appUrl}/claim-ticket?email=${encodeURIComponent(data.attendeeEmail)}`;

  const subject = isEs
    ? `${data.buyerName} te ha enviado una entrada para ${data.eventName}`
    : `${data.buyerName} sent you a ticket for ${data.eventName}`;

  const greeting = isEs
    ? `Hola ${data.attendeeName},`
    : `Hi ${data.attendeeName},`;

  const intro = isEs
    ? `${data.buyerName} te compró una entrada para <strong>${escapeHtml(data.eventName)}</strong>. Crea tu cuenta en Tapee para recibir tu código QR y acceder al evento.`
    : `${data.buyerName} purchased a ticket for <strong>${escapeHtml(data.eventName)}</strong> for you. Create your Tapee account to receive your QR code and access the event.`;

  const btnLabel = isEs ? "Crear mi cuenta" : "Create my account";

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Tienes una entrada" : "You have a ticket"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${claimUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${btnLabel}</a>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">${isEs ? "Una vez creada tu cuenta, tu entrada se vinculará automáticamente." : "Once you create your account, your ticket will be linked automatically."}</p>
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${data.buyerName} te compró una entrada para ${data.eventName}. Crea tu cuenta aquí: ${claimUrl}\n\n— El equipo de Tapee`
    : `${greeting}\n\n${data.buyerName} purchased a ticket for ${data.eventName} for you. Create your account here: ${claimUrl}\n\n— The Tapee team`;

  return sendEmail({
    to: data.attendeeEmail,
    toName: data.attendeeName,
    subject,
    htmlContent,
    textContent,
  });
}

interface AccountActivationEmailData {
  attendeeName: string;
  attendeeEmail: string;
  eventName: string;
  buyerName: string;
  activationUrl: string;
  locale?: string;
}

export async function sendAccountActivationEmail(data: AccountActivationEmailData): Promise<boolean> {
  const isEs = (data.locale ?? "es").startsWith("es");

  const subject = isEs
    ? `🎟️ ${data.buyerName} te compró una entrada — Activa tu cuenta Tapee`
    : `🎟️ ${data.buyerName} bought you a ticket — Activate your Tapee account`;

  const greeting = isEs
    ? `Hola ${data.attendeeName},`
    : `Hi ${data.attendeeName},`;

  const intro = isEs
    ? `<strong>${escapeHtml(data.buyerName)}</strong> te compró una entrada para <strong>${escapeHtml(data.eventName)}</strong>. Ya creamos tu cuenta en Tapee — solo necesitas crear una contraseña para acceder a tu entrada y código QR.`
    : `<strong>${escapeHtml(data.buyerName)}</strong> bought you a ticket for <strong>${escapeHtml(data.eventName)}</strong>. We've created your Tapee account — just set a password to access your ticket and QR code.`;

  const btnLabel = isEs ? "Activar mi cuenta" : "Activate my account";

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Tienes una entrada" : "You have a ticket"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.activationUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${btnLabel}</a>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">${isEs ? "Tu entrada ya está vinculada a tu cuenta. Una vez actives tu cuenta podrás ver tu código QR." : "Your ticket is already linked to your account. Once you activate your account you'll be able to see your QR code."}</p>
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${data.buyerName} te compró una entrada para ${data.eventName}. Activa tu cuenta aquí: ${data.activationUrl}\n\n— El equipo de Tapee`
    : `${greeting}\n\n${data.buyerName} bought you a ticket for ${data.eventName}. Activate your account here: ${data.activationUrl}\n\n— The Tapee team`;

  return sendEmail({
    to: data.attendeeEmail,
    toName: data.attendeeName,
    subject,
    htmlContent,
    textContent,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

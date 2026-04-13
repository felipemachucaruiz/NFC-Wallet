import { sendEmail, getAppUrl, type InlineImage } from "./email";
import { logger } from "./logger";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { buildAppleWalletUrl, buildGoogleWalletUrl } from "../routes/appleWallet";

function getEmailAssetsDir(): string {
  const d = (globalThis as { __dirname?: string }).__dirname;
  if (d) return path.join(d, "assets");
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets");
}

function readAssetBase64(filename: string): string {
  try {
    const assetPath = path.join(getEmailAssetsDir(), filename);
    return fs.readFileSync(assetPath).toString("base64");
  } catch {
    return "";
  }
}

const APP_URL = process.env.APP_URL ?? "";
const STAFF_API_BASE_URL = process.env.STAFF_API_BASE_URL ?? "https://prod.tapee.app";

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

function ticketEmailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .email-body { background: #0a0a0a !important; }
    .ticket-card { background: #1a1a1a !important; border-color: #333 !important; }
    .ticket-details { background: #1a1a1a !important; }
    .detail-label { color: #a1a1aa !important; }
    .detail-value { color: #ffffff !important; }
    .event-title { color: #ffffff !important; }
    .venue-text { color: #a1a1aa !important; }
    .qr-bg { background: #ffffff !important; }
    .separator-line { border-color: #333 !important; }
    .footer-bg { background: #111 !important; border-color: #333 !important; }
    .footer-text { color: #71717a !important; }
    .attendee-name { color: #d4d4d8 !important; }
    .greeting-text { color: #d4d4d8 !important; }
    .intro-text { color: #a1a1aa !important; }
    .badge-bg { background: #064e3b !important; }
    .badge-text { color: #34d399 !important; }
    .wallet-text { color: #a1a1aa !important; }
  }
</style>
</head>
<body class="email-body" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f4f4f5; color: #1a1a1a; margin: 0; padding: 0;">
  <div style="max-width: 480px; margin: 32px auto; padding: 0 16px;">
    <div style="background: linear-gradient(135deg, #0a0a0a, #111827); padding: 28px 32px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      ${getLogoImg()}
    </div>
    <div style="padding-top: 24px;">
    ${body}
    </div>
    <div class="footer-bg" style="padding: 16px; text-align: center; margin-top: 16px;">
      <p class="footer-text" style="color: #71717a; font-size: 12px; margin: 0;">&copy; Tapee &middot; Eventos</p>
    </div>
  </div>
</body>
</html>`;
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
  eventStartsAt?: string;
  flyerImageUrl?: string;
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
  price?: number;
  currencyCode?: string;
}

export async function sendTicketConfirmationEmail(data: TicketEmailData): Promise<boolean> {
  const isEs = (data.locale ?? "es").startsWith("es");
  const appUrl = getAppUrl() || APP_URL;

  const subject = isEs
    ? `🎟️ Tu entrada para ${data.eventName}`
    : `🎟️ Your ticket for ${data.eventName}`;

  const greeting = isEs
    ? `Hola ${data.attendeeName},`
    : `Hi ${data.attendeeName},`;

  const intro = isEs
    ? "Tu entrada ha sido confirmada. Presenta el QR en la puerta del evento."
    : "Your ticket has been confirmed. Present the QR code at the event gate.";

  const appleWalletUrl = buildAppleWalletUrl(data.ticketId, appUrl);
  const googleWalletUrl = buildGoogleWalletUrl(data.ticketId, appUrl);

  let qrBase64 = "";
  const inlineImages: InlineImage[] = [];
  try {
    const qrBuffer = await QRCode.toBuffer(data.qrCodeToken, {
      width: 280,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "H",
      type: "png",
    });
    qrBase64 = qrBuffer.toString("base64");
    inlineImages.push({ name: "qrcode.png", content: qrBase64 });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR code for email");
  }

  const tapeeIconBase64 = readAssetBase64("wallet-icon.png");
  if (tapeeIconBase64) inlineImages.push({ name: "tapee-icon.png", content: tapeeIconBase64 });

  const appleWalletBadgeBase64 = readAssetBase64("apple-wallet-badge.png");
  const googleWalletBadgeBase64 = readAssetBase64("google-wallet-badge.png");
  if (appleWalletBadgeBase64) inlineImages.push({ name: "apple-wallet-badge.png", content: appleWalletBadgeBase64 });
  if (googleWalletBadgeBase64) inlineImages.push({ name: "google-wallet-badge.png", content: googleWalletBadgeBase64 });

  const validDaysList = data.validDays.length > 0
    ? data.validDays.join(", ")
    : (isEs ? "Todos los dias" : "All days");

  const qrImageHtml = qrBase64
    ? `<div style="display:inline-block;position:relative;">
        <img src="cid:qrcode.png" alt="QR Code" width="220" height="220" style="display:block;border-radius:12px;" />
        ${tapeeIconBase64 ? `<img src="cid:tapee-icon.png" alt="Tapee" width="44" height="44" style="position:absolute;top:88px;left:88px;border-radius:8px;background:#ffffff;padding:4px;" />` : ""}
       </div>`
    : `<p style="color: #ef4444; font-size: 14px; margin: 0;">${isEs ? "No se pudo generar el QR. Usa la app de Tapee." : "QR code could not be generated. Use the Tapee app."}</p>`;

  let flyerUrl = "";
  if (data.flyerImageUrl) {
    flyerUrl = data.flyerImageUrl.startsWith("http")
      ? data.flyerImageUrl
      : `${STAFF_API_BASE_URL}${data.flyerImageUrl}`;
  }

  let startDateHtml = "";
  if (data.eventStartsAt) {
    try {
      const dt = new Date(data.eventStartsAt);
      const dateStr = dt.toLocaleDateString(isEs ? "es-CO" : "en-US", {
        weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota",
      });
      const timeStr = dt.toLocaleTimeString(isEs ? "es-CO" : "en-US", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
      });
      startDateHtml = `
        <tr>
          <td style="width:50%;padding:8px 0 0;">
            <span class="detail-label" style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? "Fecha" : "Date"}</span><br/>
            <span class="detail-value" style="color:#1a1a1a;font-size:14px;font-weight:600;">${dateStr}</span>
          </td>
          <td style="width:50%;padding:8px 0 0;">
            <span class="detail-label" style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? "Hora" : "Time"}</span><br/>
            <span class="detail-value" style="color:#1a1a1a;font-size:14px;font-weight:600;">${timeStr}</span>
          </td>
        </tr>`;
    } catch {}
  }

  let priceHtml = "";
  if (data.price !== undefined && data.price > 0) {
    const currency = data.currencyCode ?? "COP";
    const formatted = new Intl.NumberFormat(isEs ? "es-CO" : "en-US", {
      style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(data.price);
    priceHtml = `<span style="font-size:13px;color:#10b981;">&#x1F3F7; ${formatted}</span>`;
  } else {
    priceHtml = `<span style="font-size:13px;color:#10b981;">&#x1F3F7; ${isEs ? "Entrada gratis" : "Free entry"}</span>`;
  }

  const body = `
    <p class="greeting-text" style="color:#52525b;margin:0 0 4px;font-size:15px;">${greeting}</p>
    <p class="intro-text" style="color:#71717a;margin:0 0 24px;font-size:14px;">${intro}</p>

    ${flyerUrl ? `<div style="margin-bottom:20px;">
      <img src="${escapeHtml(flyerUrl)}" alt="${escapeHtml(data.eventName)}" width="100%" style="display:block;border-radius:16px;border:0;max-width:100%;" />
    </div>` : ""}

    <div class="ticket-card" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <div class="ticket-details" style="padding:20px 24px 16px;">
        <h2 class="event-title" style="color:#1a1a1a;font-size:20px;font-weight:700;margin:0 0 6px;">${escapeHtml(data.eventName)}</h2>

        ${data.venueName ? `<p class="venue-text" style="color:#71717a;font-size:14px;margin:0 0 12px;">&#x1F4CD; ${escapeHtml(data.venueName)}</p>` : ""}

        <table style="width:100%;border-collapse:collapse;">
          ${startDateHtml}
        </table>

        <div style="margin-top:14px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">${priceHtml}</td>
              <td style="vertical-align:middle;text-align:right;">
                <span class="badge-bg badge-text" style="display:inline-block;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;">${isEs ? "Valida" : "Valid"}</span>
              </td>
            </tr>
          </table>
        </div>

        ${data.sectionName && data.sectionName !== "General" ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e4e4e7;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:50%;">
                <span class="detail-label" style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? "Seccion" : "Section"}</span><br/>
                <span class="detail-value" style="color:#1a1a1a;font-size:13px;">${escapeHtml(data.sectionName)}</span>
              </td>
              <td style="width:50%;">
                <span class="detail-label" style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? "Tipo" : "Type"}</span><br/>
                <span class="detail-value" style="color:#1a1a1a;font-size:13px;">${escapeHtml(data.ticketTypeName)}</span>
              </td>
            </tr>
          </table>
        </div>` : `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e4e4e7;">
          <span class="detail-label" style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? "Tipo" : "Type"}</span><br/>
          <span class="detail-value" style="color:#1a1a1a;font-size:13px;">${escapeHtml(data.ticketTypeName)}</span>
        </div>`}
      </div>

      <div style="position:relative;margin:0 12px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:20px;"><div style="width:20px;height:20px;background:#f4f4f5;border-radius:50%;margin-left:-10px;"></div></td>
            <td style="border-top:2px dashed #e4e4e7;"></td>
            <td style="width:20px;"><div style="width:20px;height:20px;background:#f4f4f5;border-radius:50%;margin-left:-10px;"></div></td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;padding:20px 20px 8px;">
        <div class="qr-bg" style="display:inline-block;background:#ffffff;border-radius:12px;padding:12px;">
          ${qrImageHtml}
        </div>
      </div>

      <div style="padding:12px 24px 20px;text-align:center;">
        <p class="attendee-name" style="color:#71717a;font-size:13px;margin:0;">${escapeHtml(data.attendeeName)}</p>
      </div>
    </div>

    <div style="text-align:center;margin:24px 0 8px;">
      <p class="wallet-text" style="color:#71717a;font-size:13px;margin:0 0 12px;">${isEs ? "Agrega a tu billetera" : "Add to your wallet"}</p>
      ${appleWalletBadgeBase64
        ? `<a href="${appleWalletUrl}" style="display:inline-block;margin:4px;text-decoration:none;"><img src="cid:apple-wallet-badge.png" alt="Añadir a Apple Wallet" width="180" style="display:inline-block;border:0;" /></a>`
        : `<a href="${appleWalletUrl}" style="display:inline-block;background-color:#000000;color:#ffffff;font-weight:bold;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none;margin:4px;">&#x1F34E; Apple Wallet</a>`}
      ${googleWalletBadgeBase64
        ? `<a href="${googleWalletUrl}" style="display:inline-block;margin:4px;text-decoration:none;"><img src="cid:google-wallet-badge.png" alt="Añadir a Google Wallet" width="180" style="display:inline-block;border:0;" /></a>`
        : `<a href="${googleWalletUrl}" style="display:inline-block;background-color:#4285f4;color:#ffffff;font-weight:bold;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none;margin:4px;">&#x1F4F1; Google Wallet</a>`}
    </div>
  `;

  const htmlContent = ticketEmailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${intro}\n\nEvento: ${data.eventName}\nLugar: ${data.venueName}\nSeccion: ${data.sectionName}\nTipo: ${data.ticketTypeName}\nDias validos: ${validDaysList}\nOrden: ${data.orderId}\n\n-- El equipo de Tapee`
    : `${greeting}\n\n${intro}\n\nEvent: ${data.eventName}\nVenue: ${data.venueName}\nSection: ${data.sectionName}\nType: ${data.ticketTypeName}\nValid days: ${validDaysList}\nOrder: ${data.orderId}\n\n-- The Tapee team`;

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
    ? `${data.buyerName} te compro una entrada para <strong>${escapeHtml(data.eventName)}</strong>. Crea tu cuenta en Tapee para recibir tu codigo QR y acceder al evento.`
    : `${data.buyerName} purchased a ticket for <strong>${escapeHtml(data.eventName)}</strong> for you. Create your Tapee account to receive your QR code and access the event.`;

  const btnLabel = isEs ? "Crear mi cuenta" : "Create my account";

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Tienes una entrada" : "You have a ticket"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${claimUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${btnLabel}</a>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">${isEs ? "Una vez creada tu cuenta, tu entrada se vinculara automaticamente." : "Once you create your account, your ticket will be linked automatically."}</p>
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${data.buyerName} te compro una entrada para ${data.eventName}. Crea tu cuenta aqui: ${claimUrl}\n\n-- El equipo de Tapee`
    : `${greeting}\n\n${data.buyerName} purchased a ticket for ${data.eventName} for you. Create your account here: ${claimUrl}\n\n-- The Tapee team`;

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
    ? `🎟️ ${data.buyerName} te compro una entrada — Activa tu cuenta Tapee`
    : `🎟️ ${data.buyerName} bought you a ticket — Activate your Tapee account`;

  const greeting = isEs
    ? `Hola ${data.attendeeName},`
    : `Hi ${data.attendeeName},`;

  const intro = isEs
    ? `<strong>${escapeHtml(data.buyerName)}</strong> te compro una entrada para <strong>${escapeHtml(data.eventName)}</strong>. Ya creamos tu cuenta en Tapee — solo necesitas crear una contraseña para acceder a tu entrada y codigo QR.`
    : `<strong>${escapeHtml(data.buyerName)}</strong> bought you a ticket for <strong>${escapeHtml(data.eventName)}</strong>. We've created your Tapee account — just set a password to access your ticket and QR code.`;

  const btnLabel = isEs ? "Activar mi cuenta" : "Activate my account";

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Tienes una entrada" : "You have a ticket"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.activationUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${btnLabel}</a>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">${isEs ? "Tu entrada ya esta vinculada a tu cuenta. Una vez actives tu cuenta podras ver tu codigo QR." : "Your ticket is already linked to your account. Once you activate your account you'll be able to see your QR code."}</p>
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${data.buyerName} te compro una entrada para ${data.eventName}. Activa tu cuenta aqui: ${data.activationUrl}\n\n-- El equipo de Tapee`
    : `${greeting}\n\n${data.buyerName} bought you a ticket for ${data.eventName}. Activate your account here: ${data.activationUrl}\n\n-- The Tapee team`;

  return sendEmail({
    to: data.attendeeEmail,
    toName: data.attendeeName,
    subject,
    htmlContent,
    textContent,
  });
}

interface TransferEmailData {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  eventName: string;
  locale?: string;
}

export async function sendTicketTransferEmail(data: TransferEmailData): Promise<boolean> {
  const isEs = (data.locale ?? "es").startsWith("es");

  const subject = isEs
    ? `🎟️ ${data.senderName} te ha transferido una entrada para ${data.eventName}`
    : `🎟️ ${data.senderName} transferred a ticket to you for ${data.eventName}`;

  const greeting = isEs
    ? `Hola ${data.recipientName},`
    : `Hi ${data.recipientName},`;

  const intro = isEs
    ? `<strong>${escapeHtml(data.senderName)}</strong> te ha transferido una entrada para <strong>${escapeHtml(data.eventName)}</strong>. Abre la app de Tapee o inicia sesion en tapee.app para ver tu entrada y codigo QR.`
    : `<strong>${escapeHtml(data.senderName)}</strong> transferred a ticket to you for <strong>${escapeHtml(data.eventName)}</strong>. Open the Tapee app or sign in at tapee.app to view your ticket and QR code.`;

  const body = `
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">🎟️ ${isEs ? "Te han transferido una entrada" : "You received a ticket transfer"}</h2>
    <p style="color: #52525b; margin: 0 0 24px;">${greeting} ${intro}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="https://tickets.tapee.app/my-tickets" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${isEs ? "Ver mi entrada" : "View my ticket"}</a>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">${isEs ? "Tu entrada ya esta vinculada a tu cuenta. Presenta el codigo QR en la puerta del evento." : "Your ticket is already linked to your account. Present the QR code at the event gate."}</p>
  `;

  const htmlContent = emailWrapper(body);
  const textContent = isEs
    ? `${greeting}\n\n${data.senderName} te ha transferido una entrada para ${data.eventName}. Abre la app de Tapee para ver tu entrada.\n\n-- El equipo de Tapee`
    : `${greeting}\n\n${data.senderName} transferred a ticket to you for ${data.eventName}. Open the Tapee app to view your ticket.\n\n-- The Tapee team`;

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

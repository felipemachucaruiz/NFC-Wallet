import crypto from "crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "./logger";

const APP_URL = process.env.APP_URL ?? "";

export interface WalletPassData {
  ticketId: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  venueAddress: string;
  sectionName: string;
  attendeeName: string;
  qrCodeToken: string;
  validDays: string[];
}

let _cachedCerts: { signerCert: string; signerKey: string } | null = null;
let _cachedWwdr: Buffer | null = null;
let _cachedIcon: Buffer | null = null;
let _cachedLogo: Buffer | null = null;

function getAssetsDir(): string {
  const d = (globalThis as { __dirname?: string }).__dirname;
  if (d) return path.join(d, "assets");
  return path.resolve(import.meta.dirname ?? __dirname, "..", "assets");
}

function loadWalletAssets() {
  if (_cachedWwdr) return;
  const assetsDir = getAssetsDir();
  try {
    _cachedWwdr = fs.readFileSync(path.join(assetsDir, "AppleWWDRCAG4.pem"));
    _cachedIcon = fs.readFileSync(path.join(assetsDir, "wallet-icon.png"));
    _cachedLogo = fs.readFileSync(path.join(assetsDir, "wallet-logo.png"));
  } catch (err) {
    logger.warn({ err }, "[walletPasses] Failed to load wallet assets");
  }
}

function extractCerts(): { signerCert: string; signerKey: string } | null {
  if (_cachedCerts) return _cachedCerts;
  const p12b64 = process.env.APPLE_WALLET_CERT_P12_BASE64;
  if (!p12b64) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-wp-"));
  const p12Path = path.join(tmpDir, "cert.p12");
  try {
    fs.writeFileSync(p12Path, Buffer.from(p12b64, "base64"));
    const cert = execSync(
      `openssl pkcs12 -nokeys -clcerts -passin pass: -legacy -in "${p12Path}" 2>/dev/null`,
      { encoding: "utf8" },
    );
    const key = execSync(
      `openssl pkcs12 -nocerts -nodes -passin pass: -legacy -in "${p12Path}" 2>/dev/null`,
      { encoding: "utf8" },
    );
    _cachedCerts = { signerCert: cert, signerKey: key };
    return _cachedCerts;
  } catch (err) {
    logger.error({ err }, "[walletPasses] Failed to extract certs from p12");
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function generateAppleWalletPass(data: WalletPassData): Promise<Buffer | null> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID || "pass.tapee.tickets";
  const teamId = process.env.APPLE_TEAM_ID || "F9V84KM292";

  const certs = extractCerts();
  if (!certs) {
    logger.warn("[walletPasses] Apple Wallet pass not configured — APPLE_WALLET_CERT_P12_BASE64 missing");
    return null;
  }

  loadWalletAssets();

  if (!_cachedWwdr) {
    logger.warn("[walletPasses] WWDR cert not found — cannot generate Apple Wallet pass");
    return null;
  }

  try {
    const { PKPass } = await import("passkit-generator");

    const buffers: Record<string, Buffer> = {
      "pass.json": Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          passTypeIdentifier: passTypeId,
          teamIdentifier: teamId,
          serialNumber: data.ticketId,
          organizationName: "Tapee",
          description: `${data.eventName} — ${data.sectionName || "Entrada"}`,
          backgroundColor: "rgb(10, 10, 10)",
          foregroundColor: "rgb(255, 255, 255)",
          labelColor: "rgb(0, 229, 255)",
          eventTicket: {
            headerFields: [
              { key: "event", value: data.eventName, label: "EVENTO" },
            ],
            primaryFields: [
              { key: "name", value: data.attendeeName || "Asistente", label: "ASISTENTE" },
            ],
            secondaryFields: [
              { key: "section", value: data.sectionName || "General", label: "SECCIÓN" },
              ...(data.eventDate ? [{ key: "date", value: data.eventDate, label: "FECHA" }] : []),
            ],
            auxiliaryFields: [
              ...(data.venueName ? [{ key: "venue", value: data.venueName, label: "LUGAR" }] : []),
              ...(data.validDays.length > 0 ? [{ key: "days", value: data.validDays.join(", "), label: "DÍAS VÁLIDOS" }] : []),
            ],
          },
          barcodes: [
            {
              message: data.qrCodeToken,
              format: "PKBarcodeFormatQR",
              messageEncoding: "iso-8859-1",
            },
          ],
          barcode: {
            message: data.qrCodeToken,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
          },
        }),
      ),
    };

    if (_cachedIcon) {
      buffers["icon.png"] = _cachedIcon;
      buffers["icon@2x.png"] = _cachedIcon;
      buffers["icon@3x.png"] = _cachedIcon;
    }
    if (_cachedLogo) {
      buffers["logo.png"] = _cachedLogo;
      buffers["logo@2x.png"] = _cachedLogo;
    }

    const pass = new PKPass(buffers, {
      wwdr: _cachedWwdr,
      signerCert: certs.signerCert,
      signerKey: certs.signerKey,
    });

    return pass.getAsBuffer();
  } catch (err) {
    logger.error({ err }, "[walletPasses] Apple Wallet pass generation failed");
    return null;
  }
}

function base64urlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

export function generateGoogleWalletSaveLink(data: WalletPassData): string | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = process.env.GOOGLE_WALLET_PRIVATE_KEY;

  if (!issuerId) {
    logger.warn("[walletPasses] Google Wallet not configured — missing GOOGLE_WALLET_ISSUER_ID");
    return null;
  }

  if (!serviceAccountEmail || !privateKeyPem) {
    logger.warn("[walletPasses] Google Wallet JWT signing not configured — missing service account credentials");
    return null;
  }

  const classId = `${issuerId}.tapee-event-ticket`;
  const objectId = `${issuerId}.ticket-${data.ticketId.replace(/-/g, "_")}`;

  const logoUri = "https://attendee.tapee.app/attendee-api/api/static/tapee-logo.png";

  const eventTicketClass = {
    id: classId,
    issuerName: "Tapee",
    reviewStatus: "UNDER_REVIEW",
    eventName: {
      defaultValue: { language: "es", value: "Evento Tapee" },
    },
    logo: {
      sourceUri: { uri: logoUri },
      contentDescription: { defaultValue: { language: "es", value: "Logo Tapee" } },
    },
  };

  const eventTicketObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    ticketHolderName: data.attendeeName || "Asistente",
    ticketNumber: data.ticketId.slice(0, 8).toUpperCase(),
    logo: {
      sourceUri: { uri: logoUri },
    },
    eventName: {
      defaultValue: { language: "es", value: data.eventName },
    },
    seatInfo: {
      section: { defaultValue: { language: "es", value: data.sectionName || "General" } },
    },
    barcode: {
      type: "QR_CODE",
      value: data.qrCodeToken,
      alternateText: data.ticketId.slice(0, 8).toUpperCase(),
    },
    textModulesData: [
      ...(data.venueName ? [{ header: "Lugar", body: data.venueName, id: "venue" }] : []),
      ...(data.eventDate ? [{ header: "Fecha", body: data.eventDate, id: "date" }] : []),
      ...(data.validDays.length > 0 ? [{ header: "Días válidos", body: data.validDays.join(", "), id: "validDays" }] : []),
    ],
    hexBackgroundColor: "#000000",
  };

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: serviceAccountEmail,
      aud: "google",
      origins: ["https://tickets.tapee.app", "https://attendee.tapee.app"],
      typ: "savetowallet",
      iat: now,
      payload: {
        eventTicketClasses: [eventTicketClass],
        eventTicketObjects: [eventTicketObject],
      },
    };

    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const decodedKey = privateKeyPem.replace(/\\n/g, "\n");
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signatureB64 = sign.sign(decodedKey, "base64url");

    const jwt = `${signingInput}.${signatureB64}`;
    return `https://pay.google.com/gp/v/save/${jwt}`;
  } catch (err) {
    logger.error({ err }, "[walletPasses] Google Wallet JWT generation failed");
    return null;
  }
}

import crypto from "crypto";
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

export async function generateAppleWalletPass(data: WalletPassData): Promise<Buffer | null> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const passCert = process.env.APPLE_PASS_CERTIFICATE;
  const passKey = process.env.APPLE_PASS_KEY;

  if (!passTypeId || !teamId || !passCert || !passKey) {
    logger.warn("Apple Wallet pass generation not configured — missing env vars");
    return null;
  }

  try {
    const { PKPass } = await import("passkit-generator");

    const pass = new PKPass(
      {},
      {
        wwdr: Buffer.from(process.env.APPLE_WWDR_CERT || "", "base64"),
        signerCert: Buffer.from(passCert, "base64"),
        signerKey: Buffer.from(passKey, "base64"),
        signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || "",
      },
      {
        serialNumber: data.ticketId,
        description: `${data.eventName} Ticket`,
        organizationName: "Tapee",
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId,
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(10, 10, 10)",
        labelColor: "rgb(139, 148, 158)",
      },
    );

    pass.type = "eventTicket";

    pass.setBarcodes({
      message: data.qrCodeToken,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    });

    pass.primaryFields.push({
      key: "event",
      label: "EVENT",
      value: data.eventName,
    });

    pass.secondaryFields.push(
      {
        key: "location",
        label: "VENUE",
        value: data.venueName,
      },
      {
        key: "section",
        label: "SECTION",
        value: data.sectionName,
      },
    );

    pass.auxiliaryFields.push(
      {
        key: "attendee",
        label: "ATTENDEE",
        value: data.attendeeName,
      },
      {
        key: "date",
        label: "DATE",
        value: data.eventDate,
      },
    );

    if (data.validDays.length > 0) {
      pass.backFields.push({
        key: "validDays",
        label: "VALID DAYS",
        value: data.validDays.join(", "),
      });
    }

    const buffer = pass.getAsBuffer();
    return buffer;
  } catch (err) {
    logger.error(`Apple Wallet pass generation failed: ${err instanceof Error ? err.message : String(err)}`);
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
    logger.warn("Google Wallet pass not configured — missing GOOGLE_WALLET_ISSUER_ID");
    return null;
  }

  if (!serviceAccountEmail || !privateKeyPem) {
    logger.warn("Google Wallet JWT signing not configured — missing service account credentials");
    return null;
  }

  const objectId = `${issuerId}.ticket-${data.ticketId}`;

  const eventTicketObject = {
    id: objectId,
    classId: `${issuerId}.tapee-event-ticket`,
    state: "ACTIVE",
    heroImage: {
      sourceUri: { uri: `${APP_URL}/api/static/tapee-logo.png` },
    },
    textModulesData: [
      { header: "Event", body: data.eventName },
      { header: "Venue", body: `${data.venueName} - ${data.venueAddress}` },
      { header: "Section", body: data.sectionName },
      { header: "Attendee", body: data.attendeeName },
      { header: "Date", body: data.eventDate },
      ...(data.validDays.length > 0 ? [{ header: "Valid Days", body: data.validDays.join(", ") }] : []),
    ],
    barcode: {
      type: "QR_CODE",
      value: data.qrCodeToken,
    },
  };

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: serviceAccountEmail,
      aud: "google",
      origins: [APP_URL || "https://tapee.app"],
      typ: "savetowallet",
      iat: now,
      payload: {
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
    logger.error(`Google Wallet JWT generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

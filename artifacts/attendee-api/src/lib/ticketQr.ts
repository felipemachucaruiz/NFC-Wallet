import crypto from "crypto";

function getTicketQrSecret(): string {
  const secret = process.env.TICKET_QR_SECRET;
  if (!secret) {
    throw new Error("TICKET_QR_SECRET environment variable is required for ticket QR code signing");
  }
  return secret;
}

export function generateTicketQrToken(ticketId: string, attendeeUserId: string | null): string {
  const payload = {
    tid: ticketId,
    uid: attendeeUserId || "",
    iat: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getTicketQrSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyTicketQrToken(token: string): { ticketId: string; attendeeUserId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getTicketQrSecret())
    .update(data)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.tid) return null;
    return { ticketId: payload.tid, attendeeUserId: payload.uid || "" };
  } catch {
    return null;
  }
}

import { Router, type IRouter, type Request, type Response } from "express";
import { db, ticketsTable, ticketOrdersTable, eventsTable, ticketTypesTable, venueSectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PKPass } from "passkit-generator";
import { mintVASToken, encodeVASToken, loadSigningPrivateKey } from "../utils/vasToken.js";

const router: IRouter = Router();

// ─── VAS NFC field builder ────────────────────────────────────────────────────

/**
 * Build the `nfc` field for pass.json.
 *
 * message: base64url-encoded SignedVASToken (ECDSA P-256).
 *   - uid derived from ticketId + eventSlug (scoped, not raw UUID)
 *   - bal: 0 (tickets are not cashless passes — for cashless passes use a bracelet ID + real balance)
 *   - seq: 0 (minted fresh)
 *
 * encryptionPublicKeyPoint: compressed X9.62 hex of the POS terminal's ECIES key.
 *   iOS will ECIES-encrypt `message` before sending it to the terminal, so only
 *   terminals holding the matching private key (in Android Keystore) can read it.
 *
 * Returns {} (empty) if env vars are not configured — pass generation still succeeds,
 * the pass just won't support VAS NFC reading.
 */
function buildVASNfcField(ticketId: string, eventSlug: string): Record<string, unknown> {
  const eciesKeyHex = process.env.VAS_ECIES_PUBLIC_KEY_HEX;
  if (!eciesKeyHex) return {};

  let privKey: string;
  try {
    privKey = loadSigningPrivateKey();
  } catch {
    return {};
  }

  try {
    const uid   = crypto.createHmac("sha256", eventSlug).update(ticketId).digest("hex").slice(0, 16);
    const token = mintVASToken(
      { uid, bal: 0, seq: 0, ts: Math.floor(Date.now() / 1000), eid: eventSlug },
      privKey,
    );
    const message = encodeVASToken(token);

    return {
      nfc: {
        message,
        encryptionPublicKeyPoint: eciesKeyHex, // 33-byte compressed X9.62 hex
        requiresAuthentication: false,         // true = requires Face ID / Touch ID before NFC
      },
    };
  } catch {
    return {};
  }
}

const API_SERVER_URL = (process.env.API_SERVER_URL ?? "https://prod.tapee.app").replace(/\/$/, "");

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_SERVER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

const HMAC_SECRET = process.env.HMAC_SECRET;
const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || "pass.tapee.tickets";
const TEAM_ID = process.env.APPLE_TEAM_ID || "F9V84KM292";
const CERT_P12_B64 = process.env.APPLE_WALLET_CERT_P12_BASE64;

let _cachedCerts: { signerCert: string; signerKey: string } | null = null;
let _cachedWwdr: Buffer | null = null;
let _cachedIcon: Buffer | null = null;
let _cachedLogo: Buffer | null = null;

function getAssetsDir(): string {
  const d = (globalThis as { __dirname?: string }).__dirname;
  if (d) return path.join(d, "assets");
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets");
}

function loadAssets() {
  if (_cachedWwdr && _cachedIcon && _cachedLogo) return;
  const assetsDir = getAssetsDir();
  try {
    _cachedWwdr = fs.readFileSync(path.join(assetsDir, "AppleWWDRCAG4.pem"));
    _cachedIcon = fs.readFileSync(path.join(assetsDir, "wallet-icon.png"));
    _cachedLogo = fs.readFileSync(path.join(assetsDir, "wallet-logo.png"));
  } catch (err) {
    console.error("[appleWallet] Failed to load assets:", err);
  }
}

function extractCerts(): { signerCert: string; signerKey: string } {
  if (_cachedCerts) return _cachedCerts;
  if (!CERT_P12_B64) throw new Error("APPLE_WALLET_CERT_P12_BASE64 not configured");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const p12Path = path.join(tmpDir, "cert.p12");
  try {
    fs.writeFileSync(p12Path, Buffer.from(CERT_P12_B64, "base64"));

    // Try with -legacy first (OpenSSL 3.x), fall back without it (OpenSSL 1.x)
    let cert: string;
    let key: string;
    try {
      cert = execSync(
        `openssl pkcs12 -nokeys -clcerts -passin pass: -legacy -in "${p12Path}"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      key = execSync(
        `openssl pkcs12 -nocerts -nodes -passin pass: -legacy -in "${p12Path}"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch {
      console.log("[appleWallet] -legacy flag failed, retrying without it");
      cert = execSync(
        `openssl pkcs12 -nokeys -clcerts -passin pass: -in "${p12Path}"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      key = execSync(
        `openssl pkcs12 -nocerts -nodes -passin pass: -in "${p12Path}"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
    }

    if (!cert || !key) throw new Error("OpenSSL returned empty cert or key");
    _cachedCerts = { signerCert: cert, signerKey: key };
    return _cachedCerts;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function generateWalletToken(ticketId: string): string {
  if (!HMAC_SECRET) throw new Error("HMAC_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + 86400 * 365;
  const payload = `${ticketId}:${exp}`;
  const sig = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyWalletToken(token: string, expectedId: string): boolean {
  if (!HMAC_SECRET) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;
    const [tid, expStr, sig] = parts;
    if (tid !== expectedId) return false;
    const exp = parseInt(expStr);
    if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expectedSig = crypto.createHmac("sha256", HMAC_SECRET).update(`${tid}:${expStr}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

export function buildAppleWalletUrl(ticketId: string, baseUrl: string): string {
  const token = generateWalletToken(ticketId);
  return `${baseUrl}/api/tickets/${ticketId}/apple-wallet?token=${token}`;
}

export function buildGoogleWalletUrl(ticketId: string, baseUrl: string): string {
  const token = generateWalletToken(ticketId);
  return `${baseUrl}/api/tickets/${ticketId}/google-wallet-link?token=${token}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

router.get(
  "/tickets/:ticketId/apple-wallet",
  async (req: Request, res: Response) => {
    const { ticketId } = req.params as { ticketId: string };
    const token = req.query.token as string;

    if (!token || !verifyWalletToken(token, ticketId)) {
      res.status(403).json({ error: "Token inválido o expirado" });
      return;
    }

    if (!CERT_P12_B64) {
      res.status(503).json({ error: "Apple Wallet no configurado" });
      return;
    }

    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId));
    if (!ticket) {
      res.status(404).json({ error: "Tiquete no encontrado" });
      return;
    }

    const [order] = ticket.orderId
      ? await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId))
      : [undefined];

    const [event] = order
      ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId))
      : [undefined];

    let ticketTypeName = "Entrada";
    let sectionName = "";
    if (ticket.ticketTypeId) {
      const [tt] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
      if (tt) {
        ticketTypeName = tt.name;
        if (tt.sectionId) {
          const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, tt.sectionId));
          if (sec) sectionName = sec.name;
        }
      }
    }

    const eventName = event?.name ?? "Evento Tapee";
    const startsAt = event?.startsAt ? new Date(event.startsAt) : null;
    const eventDateIso = startsAt ? startsAt.toISOString() : null;
    const venue = event?.venueAddress ?? "";
    const attendeeName = ticket.attendeeName ?? order?.buyerName ?? "Asistente";
    const qrMessage = ticket.qrCodeToken ?? ticketId;

    try {
      loadAssets();
      const { signerCert, signerKey } = extractCerts();

      const passJson = {
        formatVersion: 1,
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier: TEAM_ID,
        serialNumber: ticket.id,
        organizationName: "Tapee",
        description: `${eventName} — ${ticketTypeName}`,
        backgroundColor: "rgb(0, 0, 0)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(180, 180, 180)",
        eventTicket: {
          headerFields: [
            ...(eventDateIso ? [{
              key: "date",
              value: eventDateIso,
              label: "FECHA",
              dateStyle: "short",
              timeStyle: "none",
            }] : []),
          ],
          primaryFields: [
            { key: "name", value: attendeeName, label: "NOMBRE" },
          ],
          secondaryFields: [
            { key: "type", value: sectionName ? `${ticketTypeName} – ${sectionName}` : ticketTypeName, label: "TIPO" },
            ...(eventDateIso ? [{
              key: "time",
              value: eventDateIso,
              label: "HORA",
              dateStyle: "none",
              timeStyle: "short",
            }] : []),
          ],
          auxiliaryFields: [
            { key: "event", value: eventName, label: "EVENTO" },
            ...(venue ? [{ key: "venue", value: venue, label: "LUGAR" }] : []),
          ],
        },
        barcodes: [
          {
            message: qrMessage,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
          },
        ],
        barcode: {
          message: qrMessage,
          format: "PKBarcodeFormatQR",
          messageEncoding: "iso-8859-1",
        },
        // ── Apple VAS (Value Added Services) — Digital Wallet Cashless ──────
        // encryptionPublicKeyPoint: compressed X9.62 P-256 public key of the
        // POS terminal. iOS encrypts the message with this key via ECIES before
        // transmitting, so only our terminals can decrypt it.
        // message: signed VAS token (ECDSA P-256 by backend) encoded as base64url.
        // Requires: VAS_ECIES_PUBLIC_KEY_HEX + VAS_SIGNING_PRIVATE_KEY_B64 env vars.
        // Also requires the pass type to be enrolled in Apple VAS (merchantId).
        ...buildVASNfcField(ticket.id, event?.slug ?? "tapee"),
      };

      const buffers: Record<string, Buffer> = {
        "pass.json": Buffer.from(JSON.stringify(passJson)),
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

      // Background image: resolve relative URLs then download + blur + dark gradient
      const rawFlyerUrl = event?.flyerImageUrl ?? event?.coverImageUrl ?? null;
      const flyerUrl = resolveImageUrl(rawFlyerUrl);
      if (flyerUrl) {
        try {
          const flyerRes = await fetch(flyerUrl, { signal: AbortSignal.timeout(8000) });
          if (flyerRes.ok) {
            const flyerBuf = Buffer.from(await flyerRes.arrayBuffer());
            const { default: sharp } = await import("sharp");
            const makeBackground = async (w: number, h: number) => {
              const gradientSvg = Buffer.from(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#000000" stop-opacity="0.15"/>
                      <stop offset="60%" stop-color="#000000" stop-opacity="0.45"/>
                      <stop offset="100%" stop-color="#000000" stop-opacity="0.80"/>
                    </linearGradient>
                  </defs>
                  <rect width="${w}" height="${h}" fill="url(#g)"/>
                </svg>`
              );
              return sharp(flyerBuf)
                .resize(w, h, { fit: "cover", position: "center" })
                .blur(6)
                .composite([{ input: gradientSvg, blend: "over" }])
                .png()
                .toBuffer();
            };
            buffers["background.png"] = await makeBackground(180, 220);
            buffers["background@2x.png"] = await makeBackground(360, 440);
            buffers["background@3x.png"] = await makeBackground(540, 660);
          } else {
            console.warn(`[appleWallet] Flyer fetch returned ${flyerRes.status} for ${flyerUrl}`);
          }
        } catch (err) {
          console.warn("[appleWallet] Skipping flyer background — fetch/process failed:", err);
        }
      }

      if (!_cachedWwdr) {
        throw new Error("WWDR certificate not loaded from assets");
      }

      const pass = new PKPass(buffers, {
        wwdr: _cachedWwdr,
        signerCert,
        signerKey,
      });

      const pkpassBuffer = pass.getAsBuffer();

      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Content-Disposition", `attachment; filename="${ticket.id}.pkpass"`);
      res.send(pkpassBuffer);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[appleWallet] Error generating pass:", errMsg, err);
      res.status(500).json({ error: `Error al generar el pase de Apple Wallet: ${errMsg}` });
    }
  },
);

router.get(
  "/tickets/:ticketId/google-wallet-link",
  async (req: Request, res: Response) => {
    const { ticketId } = req.params as { ticketId: string };
    const token = req.query.token as string;

    if (!token || !verifyWalletToken(token, ticketId)) {
      res.status(403).json({ error: "Token inválido o expirado" });
      return;
    }

    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId));
    if (!ticket) {
      res.status(404).json({ error: "Tiquete no encontrado" });
      return;
    }

    const [order] = ticket.orderId
      ? await db.select().from(ticketOrdersTable).where(eq(ticketOrdersTable.id, ticket.orderId))
      : [undefined];

    const [event] = order
      ? await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId))
      : [undefined];

    let sectionName = "General";
    if (ticket.ticketTypeId) {
      const [tt] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, ticket.ticketTypeId));
      if (tt?.sectionId) {
        const [sec] = await db.select({ name: venueSectionsTable.name }).from(venueSectionsTable).where(eq(venueSectionsTable.id, tt.sectionId));
        if (sec) sectionName = sec.name;
      }
    }

    const { generateGoogleWalletSaveLink } = await import("../lib/walletPasses");

    const saveLink = generateGoogleWalletSaveLink({
      ticketId: ticket.id,
      eventName: event?.name ?? "Evento Tapee",
      eventDate: event?.startsAt ? new Date(event.startsAt).toISOString().split("T")[0] : "",
      venueName: event?.venueAddress ?? "",
      venueAddress: event?.venueAddress ?? "",
      sectionName,
      attendeeName: ticket.attendeeName ?? order?.buyerName ?? "Asistente",
      qrCodeToken: ticket.qrCodeToken ?? ticket.id,
      validDays: [],
    });

    if (!saveLink) {
      res.status(503).json({ error: "Google Wallet no configurado" });
      return;
    }

    res.redirect(saveLink);
  },
);

export default router;

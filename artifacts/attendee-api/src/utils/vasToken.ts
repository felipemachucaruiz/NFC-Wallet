/**
 * VAS Token — Tapee Digital Wallet Cashless
 *
 * Signing scheme:
 *   - Backend mints: ECDSA P-256 (dsaEncoding "ieee-p1363" → 64-byte fixed r‖s, base64url)
 *   - POS re-signs after debit: HMAC-SHA256 (same hmacSecret already cached on device)
 *
 * Wire format (fits within Apple VAS 256-byte message limit):
 *   base64url( JSON({ uid, bal, seq, ts, eid, sig, stype }) )
 *
 * Canonical message for signing (pipe-delimited, no spaces):
 *   "<uid>|<bal>|<seq>|<ts>|<eid>"
 *
 * Key env vars:
 *   VAS_SIGNING_PRIVATE_KEY_B64  — base64(PEM PKCS8 P-256 private key) — backend only
 *   VAS_SIGNING_PUBLIC_KEY_B64   — base64(PEM SPKI P-256 public key)  — distributed to POS
 *   VAS_ECIES_PUBLIC_KEY_HEX     — compressed X9.62 hex (33 bytes)    — in pass.json nfc field
 */

import { createSign, createVerify, createHmac, createPublicKey, generateKeyPairSync, timingSafeEqual } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VASTokenPayload {
  uid: string;  // 16-char hex derived from bracelet/user ID — scoped to event
  bal: number;  // Balance in centavos (≥0, integer)
  seq: number;  // Monotonic counter: 0 = minted by backend, ≥1 = debited by POS
  ts:  number;  // Unix seconds — issue/last-update time
  eid: string;  // Event slug — prevents cross-event replay
}

export interface SignedVASToken extends VASTokenPayload {
  sig:   string;             // base64url
  stype: "ecdsa" | "hmac";  // Identifies which key to verify with
}

// ─── Canonical message (deterministic field order) ────────────────────────────

function canonical(p: VASTokenPayload): string {
  return `${p.uid}|${p.bal}|${p.seq}|${p.ts}|${p.eid}`;
}

// ─── Encode / Decode (for NFC message field + HCE transport) ──────────────────

export function encodeVASToken(token: SignedVASToken): string {
  return Buffer.from(JSON.stringify(token)).toString("base64url");
}

export function decodeVASToken(encoded: string): SignedVASToken {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  return JSON.parse(json) as SignedVASToken;
}

// ─── Backend: ECDSA P-256 mint ────────────────────────────────────────────────

export function mintVASToken(payload: VASTokenPayload, privateKeyPem: string): SignedVASToken {
  const signer = createSign("SHA256");
  signer.update(canonical(payload));
  const sig = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" }, "base64url");
  return { ...payload, sig, stype: "ecdsa" };
}

// ─── POS: Verify ECDSA ────────────────────────────────────────────────────────

export function verifyVASTokenEcdsa(token: SignedVASToken, publicKeyPem: string): boolean {
  if (token.stype !== "ecdsa") return false;
  try {
    const { sig, stype, ...payload } = token;
    const verifier = createVerify("SHA256");
    verifier.update(canonical(payload as VASTokenPayload));
    return verifier.verify({ key: publicKeyPem, dsaEncoding: "ieee-p1363" }, sig, "base64url");
  } catch {
    return false;
  }
}

// ─── POS: HMAC re-sign after debit ───────────────────────────────────────────

export function reSignVASTokenHmac(payload: VASTokenPayload, hmacSecret: string): SignedVASToken {
  const sig = createHmac("sha256", hmacSecret).update(canonical(payload)).digest("base64url");
  return { ...payload, sig, stype: "hmac" };
}

// ─── Backend sync: Verify HMAC ────────────────────────────────────────────────

export function verifyVASTokenHmac(token: SignedVASToken, hmacSecret: string): boolean {
  if (token.stype !== "hmac") return false;
  try {
    const { sig, stype, ...payload } = token;
    const expected = createHmac("sha256", hmacSecret).update(canonical(payload as VASTokenPayload)).digest("base64url");
    const a = Buffer.from(sig,      "base64url");
    const b = Buffer.from(expected, "base64url");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Helpers for key management ───────────────────────────────────────────────

/** Generate a fresh P-256 key pair. Run once; store results as env vars. */
export function generateVASKeyPair(): { publicKeyPem: string; privateKeyPem: string; publicKeyCompressedHex: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve:    "prime256v1",
    publicKeyEncoding:  { type: "spki",  format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const compressed = compressPublicKey(publicKey as string);
  return {
    publicKeyPem:          publicKey as string,
    privateKeyPem:         privateKey as string,
    publicKeyCompressedHex: compressed,
  };
}

/** Convert a PEM SPKI P-256 public key to compressed X9.62 hex (33 bytes, 66 hex chars). */
export function compressPublicKey(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  const der  = key.export({ type: "spki", format: "der" }) as Buffer;
  // SPKI DER ends with the raw EC point: 04 || x(32) || y(32) = 65 bytes
  const point = der.subarray(der.length - 65);
  if (point[0] !== 0x04) throw new Error("Expected uncompressed EC point (0x04 prefix)");
  const x      = point.subarray(1, 33);
  const y      = point.subarray(33, 65);
  const prefix = (y[31]! & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]).toString("hex");
}

/** Load the backend ECDSA signing private key from env. */
export function loadSigningPrivateKey(): string {
  const b64 = process.env.VAS_SIGNING_PRIVATE_KEY_B64;
  if (!b64) throw new Error("VAS_SIGNING_PRIVATE_KEY_B64 not set");
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Load the ECDSA signing public key from env (for distribution to POS). */
export function loadSigningPublicKey(): string {
  const b64 = process.env.VAS_SIGNING_PUBLIC_KEY_B64;
  if (!b64) throw new Error("VAS_SIGNING_PUBLIC_KEY_B64 not set");
  return Buffer.from(b64, "base64").toString("utf8");
}

// ─── Derive uid from bracelet NFC UID + event slug ───────────────────────────

/** Scoped uid: first 8 bytes of HMAC-SHA256(eventSlug, nfcUid), hex-encoded. */
export function deriveVASUid(nfcUid: string, eventSlug: string): string {
  return createHmac("sha256", eventSlug).update(nfcUid).digest("hex").slice(0, 16);
}

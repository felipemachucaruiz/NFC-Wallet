import crypto from "crypto";

/**
 * Derive a per-event HMAC key from the master key using HMAC-SHA256.
 * EventKey = HMAC-SHA256(masterKey, eventId)
 *
 * This means even if a database is compromised, individual event keys
 * cannot be recovered without the master key (stored only in env vars).
 */
export function deriveEventKey(masterKey: string, eventId: string): string {
  return crypto.createHmac("sha256", masterKey).update(eventId).digest("hex");
}

/**
 * Compute the HMAC signature for a bracelet payload.
 * When uid is provided (KDF mode): HMAC-SHA256(key, "balance:counter:uid")
 * When uid is absent (legacy mode): HMAC-SHA256(key, "balance:counter")
 */
export function computeBraceletHmac(
  balance: number,
  counter: number,
  key: string,
  uid?: string
): string {
  const payload = uid ? `${balance}:${counter}:${uid}` : `${balance}:${counter}`;
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

/**
 * Verify a bracelet HMAC. Accepts an array of candidate keys to try in order.
 * For each key, tries UID-bound payload first (KDF), then legacy (no UID).
 *
 * Returns { valid: true, wasLegacy: false } for UID-bound match (new format),
 *         { valid: true, wasLegacy: true }  for legacy match (old format, no UID),
 *         { valid: false }                   on failure against all candidate keys.
 */
function timingSafeHmacEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function verifyBraceletHmac(
  balance: number,
  counter: number,
  hmac: string,
  candidateKeys: string | string[],
  uid?: string
): { valid: boolean; wasLegacy: boolean } {
  const keys = Array.isArray(candidateKeys) ? candidateKeys : [candidateKeys];

  for (const key of keys) {
    if (uid) {
      const kdfSig = computeBraceletHmac(balance, counter, key, uid);
      if (timingSafeHmacEqual(kdfSig, hmac)) return { valid: true, wasLegacy: false };
    }
    const legacySig = computeBraceletHmac(balance, counter, key);
    if (timingSafeHmacEqual(legacySig, hmac)) return { valid: true, wasLegacy: true };
  }

  return { valid: false, wasLegacy: false };
}

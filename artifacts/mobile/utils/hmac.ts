import CryptoJS from "crypto-js";
import * as ExpoCrypto from "expo-crypto";

export interface BraceletPayload {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
  zoneMask?: number;
}

/**
 * Compute HMAC for a bracelet payload.
 * Zone-aware (new): HMAC-SHA256(key, "balance:counter:uid:zoneMask")
 * KDF mode:         HMAC-SHA256(key, "balance:counter:uid")
 * Legacy mode:      HMAC-SHA256(key, "balance:counter")
 */
export async function computeHmac(
  balance: number,
  counter: number,
  secret: string,
  uid?: string,
  zoneMask?: number
): Promise<string> {
  let message: string;
  if (uid && zoneMask) {
    message = `${balance}:${counter}:${uid}:${zoneMask}`;
  } else if (uid) {
    message = `${balance}:${counter}:${uid}`;
  } else {
    message = `${balance}:${counter}`;
  }
  const signature = CryptoJS.HmacSHA256(message, secret);
  return signature.toString(CryptoJS.enc.Hex);
}

/**
 * Verify a bracelet HMAC against one or more candidate keys.
 * Tries zone-aware format first (balance:counter:uid:zoneMask), then KDF (balance:counter:uid),
 * then legacy (balance:counter). Backward-compatible with pre-zone bracelets.
 *
 * @param secret        Primary (current) secret, or an array of keys to try in order
 * @param uid           UID for KDF-mode verification
 * @param legacySecrets Additional legacy secrets to try if primary fails
 * @param zoneMask      Zone bitmask written on chip (0 or absent = no zone data)
 */
export async function verifyHmac(
  balance: number,
  counter: number,
  hmac: string,
  secret: string | string[],
  uid?: string,
  legacySecrets?: string[],
  zoneMask?: number
): Promise<boolean> {
  try {
    const primaryKeys = Array.isArray(secret) ? secret : [secret];
    const allKeys = [...primaryKeys, ...(legacySecrets ?? [])];

    // Compact binary format stores only the first 8 bytes (16 hex chars).
    const isCompact = hmac.length === 16;

    for (const key of allKeys) {
      // Zone-aware format (new): balance:counter:uid:zoneMask
      if (uid && zoneMask) {
        const expected = await computeHmac(balance, counter, key, uid, zoneMask);
        if (isCompact ? expected.slice(0, 16) === hmac : expected === hmac) return true;
      }
      // KDF format: balance:counter:uid
      if (uid) {
        const kdfExpected = await computeHmac(balance, counter, key, uid);
        if (isCompact ? kdfExpected.slice(0, 16) === hmac : kdfExpected === hmac) return true;
      }
      // Legacy format: balance:counter
      const legacyExpected = await computeHmac(balance, counter, key);
      if (isCompact ? legacyExpected.slice(0, 16) === hmac : legacyExpected === hmac) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function generateId(): string {
  // Web Crypto API (crypto.randomUUID / crypto.getRandomValues) is not available
  // in React Native / Hermes. Use expo-crypto's synchronous native implementation.
  const bytes = ExpoCrypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

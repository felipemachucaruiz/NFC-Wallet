import CryptoJS from "crypto-js";

export interface BraceletPayload {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
}

/**
 * Compute HMAC for a bracelet payload.
 * When uid is provided (KDF mode): HMAC-SHA256(key, "balance:counter:uid")
 * When uid is absent (legacy mode): HMAC-SHA256(key, "balance:counter")
 */
export async function computeHmac(
  balance: number,
  counter: number,
  secret: string,
  uid?: string
): Promise<string> {
  const message = uid ? `${balance}:${counter}:${uid}` : `${balance}:${counter}`;
  const signature = CryptoJS.HmacSHA256(message, secret);
  return signature.toString(CryptoJS.enc.Hex);
}

/**
 * Verify a bracelet HMAC against one or more candidate keys.
 * For each key, tries UID-bound payload first (KDF format), then legacy (no UID).
 * This allows graceful migration: existing bracelets signed with the pre-KDF key
 * are still accepted until their next top-up re-signs them with the derived key.
 *
 * @param secret  Primary (current) secret, or an array of keys to try in order
 * @param legacySecrets  Additional legacy secrets to try if primary fails
 */
export async function verifyHmac(
  balance: number,
  counter: number,
  hmac: string,
  secret: string | string[],
  uid?: string,
  legacySecrets?: string[]
): Promise<boolean> {
  try {
    const primaryKeys = Array.isArray(secret) ? secret : [secret];
    const allKeys = [...primaryKeys, ...(legacySecrets ?? [])];

    for (const key of allKeys) {
      if (uid) {
        const kdfExpected = await computeHmac(balance, counter, key, uid);
        if (kdfExpected === hmac) return true;
      }
      const legacyExpected = await computeHmac(balance, counter, key);
      if (legacyExpected === hmac) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure crypto primitives are not available in this environment.");
}

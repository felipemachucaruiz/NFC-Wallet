import * as Crypto from "expo-crypto";

export interface BraceletPayload {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeHmac(
  balance: number,
  counter: number,
  secret: string
): Promise<string> {
  const message = `${balance}:${counter}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return toHex(signature);
}

export async function verifyHmac(
  balance: number,
  counter: number,
  hmac: string,
  secret: string
): Promise<boolean> {
  try {
    const expected = await computeHmac(balance, counter, secret);
    return expected === hmac;
  } catch {
    return false;
  }
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

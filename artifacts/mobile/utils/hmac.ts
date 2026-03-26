import CryptoJS from "crypto-js";

export interface BraceletPayload {
  uid: string;
  balance: number;
  counter: number;
  hmac: string;
}

export async function computeHmac(
  balance: number,
  counter: number,
  secret: string
): Promise<string> {
  const message = `${balance}:${counter}`;
  const signature = CryptoJS.HmacSHA256(message, secret);
  return signature.toString(CryptoJS.enc.Hex);
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

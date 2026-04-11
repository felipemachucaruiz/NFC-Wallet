import { logger } from "./logger";

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    logger.warn("TURNSTILE_SECRET_KEY not configured — skipping verification");
    return true;
  }

  try {
    const body: Record<string, string> = {
      secret: TURNSTILE_SECRET_KEY,
      response: token,
    };
    if (remoteIp) body.remoteip = remoteIp;

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    if (!data.success) {
      logger.info({ errors: data["error-codes"] }, "Turnstile verification failed");
    }

    return data.success;
  } catch (err) {
    logger.error({ err }, "Turnstile verification error");
    return false;
  }
}

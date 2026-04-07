import { logger } from "./logger";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? "no-reply@mailing.tapee.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Tapee";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!BREVO_API_KEY) {
    logger.warn("BREVO_API_KEY not set — skipping email send");
    return false;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: opts.to, name: opts.toName ?? opts.to }],
        subject: opts.subject,
        htmlContent: opts.htmlContent,
        textContent: opts.textContent,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(`Brevo email send failed — status=${res.status} body=${body}`);
      return false;
    }

    logger.info(`Brevo email sent successfully to=${opts.to}`);
    return true;
  } catch (err) {
    logger.error(`Brevo email send error — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function buildPasswordResetEmail(opts: {
  firstName: string | null;
  resetUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = opts.firstName ?? "there";
  const subject = "Reset your Tapee password";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: #161b22; border-radius: 12px; overflow: hidden; border: 1px solid #30363d;">
    <div style="background: linear-gradient(135deg, #0d1117, #111827); padding: 32px 32px 24px; text-align: center;">
      <h1 style="color: #00f1ff; font-size: 28px; margin: 0 0 8px;">Tapee</h1>
      <p style="color: #8b949e; margin: 0; font-size: 14px;">Cashless event payments</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #e6edf3; font-size: 20px; margin: 0 0 16px;">Reset your password</h2>
      <p style="color: #8b949e; margin: 0 0 24px;">Hi ${name}, we received a request to reset your password. Click the button below to set a new one.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${opts.resetUrl}" style="display: inline-block; background: #00f1ff; color: #0d1117; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Reset Password</a>
      </div>
      <p style="color: #6e7681; font-size: 13px; margin: 24px 0 0;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div style="padding: 16px 32px; background: #0d1117; text-align: center; border-top: 1px solid #30363d;">
      <p style="color: #484f58; font-size: 12px; margin: 0;">© Tapee · Cashless events</p>
    </div>
  </div>
</body>
</html>`;
  const textContent = `Hi ${name},\n\nWe received a request to reset your Tapee password.\n\nReset your password here:\n${opts.resetUrl}\n\nThis link expires in 1 hour. If you didn't request a password reset, ignore this email.\n\n— The Tapee Team`;
  return { subject, htmlContent, textContent };
}

export function buildVerificationEmail(opts: {
  firstName: string | null;
  verifyUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = opts.firstName ?? "there";
  const subject = "Verify your Tapee email address";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: #161b22; border-radius: 12px; overflow: hidden; border: 1px solid #30363d;">
    <div style="background: linear-gradient(135deg, #0d1117, #111827); padding: 32px 32px 24px; text-align: center;">
      <h1 style="color: #00f1ff; font-size: 28px; margin: 0 0 8px;">Tapee</h1>
      <p style="color: #8b949e; margin: 0; font-size: 14px;">Cashless event payments</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #e6edf3; font-size: 20px; margin: 0 0 16px;">Verify your email</h2>
      <p style="color: #8b949e; margin: 0 0 24px;">Hi ${name}, welcome to Tapee! Click the button below to verify your email address and activate your account.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${opts.verifyUrl}" style="display: inline-block; background: #00f1ff; color: #0d1117; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Verify Email</a>
      </div>
      <p style="color: #6e7681; font-size: 13px; margin: 24px 0 0;">This link expires in 24 hours.</p>
    </div>
    <div style="padding: 16px 32px; background: #0d1117; text-align: center; border-top: 1px solid #30363d;">
      <p style="color: #484f58; font-size: 12px; margin: 0;">© Tapee · Cashless events</p>
    </div>
  </div>
</body>
</html>`;
  const textContent = `Hi ${name},\n\nWelcome to Tapee! Please verify your email address by visiting:\n${opts.verifyUrl}\n\nThis link expires in 24 hours.\n\n— The Tapee Team`;
  return { subject, htmlContent, textContent };
}

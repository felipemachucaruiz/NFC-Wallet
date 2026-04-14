import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { db, usersTable, partialSessionsTable, auditorLoginActivityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSession,
  deleteSession,
  getSessionId,
  SESSION_TTL,
  SESSION_COOKIE,
} from "../lib/auth";
import crypto from "crypto";

const router: IRouter = Router();

const TOTP_ISSUER = process.env.TOTP_ISSUER ?? "Tapee";
const PARTIAL_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const TOTP_ELIGIBLE_ROLES = ["admin", "merchant_admin", "ticketing_auditor"] as const;
type TotpRole = typeof TOTP_ELIGIBLE_ROLES[number];

function isTotpEligible(role: string): role is TotpRole {
  return (TOTP_ELIGIBLE_ROLES as readonly string[]).includes(role);
}

// ── Enroll: generate a new TOTP secret + QR code ───────────────────────────

router.post("/auth/2fa/enroll", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!isTotpEligible(req.user.role)) {
    res.status(403).json({ error: "2FA is only available for admin, merchant-admin, and ticketing-auditor accounts" });
    return;
  }

  const [user] = await db
    .select({ totpEnabled: usersTable.totpEnabled, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.totpEnabled) {
    res.status(400).json({ error: "2FA is already enabled. Disable it first before re-enrolling." });
    return;
  }

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: user.email ?? req.user.id,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Store the unconfirmed secret (not enabled yet)
  await db
    .update(usersTable)
    .set({ totpSecret: secret.base32, totpEnabled: false, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  res.json({
    secret: secret.base32,
    otpauthUrl,
    qrDataUrl,
  });
});

// ── Confirm: verify the first code to activate 2FA ─────────────────────────

const ConfirmBody = z.object({ code: z.string().length(6) });

router.post("/auth/2fa/confirm", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!isTotpEligible(req.user.role)) {
    res.status(403).json({ error: "2FA is only available for admin, merchant-admin, and ticketing-auditor accounts" });
    return;
  }

  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A 6-digit code is required" });
    return;
  }

  const [user] = await db
    .select({ totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user?.totpSecret) {
    res.status(400).json({ error: "No pending enrollment. Call /auth/2fa/enroll first." });
    return;
  }

  if (user.totpEnabled) {
    res.status(400).json({ error: "2FA is already active" });
    return;
  }

  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totpSecret),
  });

  const delta = totp.validate({ token: parsed.data.code, window: 1 });
  if (delta === null) {
    res.status(400).json({ error: "Invalid code. Please try again." });
    return;
  }

  await db
    .update(usersTable)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  res.json({ message: "2FA enabled successfully" });
});

// ── Disable 2FA ─────────────────────────────────────────────────────────────

const DisableBody = z.object({ code: z.string().length(6) });

router.delete("/auth/2fa", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = DisableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A 6-digit code is required to disable 2FA" });
    return;
  }

  const [user] = await db
    .select({ totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user?.totpEnabled || !user.totpSecret) {
    res.status(400).json({ error: "2FA is not enabled" });
    return;
  }

  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totpSecret),
  });

  const delta = totp.validate({ token: parsed.data.code, window: 1 });
  if (delta === null) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }

  await db
    .update(usersTable)
    .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  res.json({ message: "2FA disabled successfully" });
});

// ── Verify step during login (uses partial session) ─────────────────────────

const VerifyBody = z.object({
  partial_token: z.string().min(1),
  code: z.string().length(6),
});

router.post("/auth/2fa/verify", async (req: Request, res: Response) => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "partial_token and 6-digit code are required" });
    return;
  }

  const { partial_token, code } = parsed.data;

  const [partialSession] = await db
    .select()
    .from(partialSessionsTable)
    .where(eq(partialSessionsTable.sid, partial_token));

  if (!partialSession || partialSession.expiresAt < new Date()) {
    res.status(401).json({ error: "Partial session expired or invalid. Please log in again." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, partialSession.userId));

  if (!user || !user.totpSecret) {
    res.status(400).json({ error: "User 2FA state is invalid" });
    return;
  }

  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totpSecret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    res.status(401).json({ error: "Invalid 2FA code" });
    return;
  }

  // Delete partial session
  await db
    .delete(partialSessionsTable)
    .where(eq(partialSessionsTable.sid, partial_token));

  // If totpEnabled was false (first login confirmation), activate 2FA now
  if (!user.totpEnabled) {
    await db
      .update(usersTable)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
  }

  // Log login activity for ticketing_auditor accounts
  if (user.role === "ticketing_auditor") {
    const forwarded = req.headers["x-forwarded-for"];
    const ipAddress = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])?.trim() ?? null
      : (req.socket?.remoteAddress ?? null);
    try {
      await db.insert(auditorLoginActivityTable).values({
        userId: user.id,
        ipAddress,
      });
    } catch {
      // Non-fatal
    }
  }

  // Issue full session
  const sessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      merchantId: user.merchantId ?? null,
      eventId: user.eventId ?? null,
      promoterCompanyId: user.promoterCompanyId ?? null,
      gateZoneId: user.gateZoneId ?? null,
    },
  };

  const sid = await createSession(sessionData);
  res.json({ token: sid });
});

// Export helper for use in login route
export async function createPartialSession(userId: string): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(partialSessionsTable).values({
    sid,
    userId,
    expiresAt: new Date(Date.now() + PARTIAL_SESSION_TTL_MS),
  });
  return sid;
}

export default router;

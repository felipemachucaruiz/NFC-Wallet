import * as oidc from "openid-client";
import crypto from "crypto";
import { hashPassword, comparePassword } from "../lib/bcryptWorker";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  GetCurrentAuthUserResponse,
} from "@workspace/api-zod";
import { db, usersTable, merchantsTable, eventsTable, passwordResetTokensTable, sessionsTable } from "@workspace/db";
import { eq, or, and, sql as drizzleSql } from "drizzle-orm";
import { createPartialSession } from "./twoFactor";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? "no-reply@mailing.tapee.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Tapee";

async function sendEmail(opts: { to: string; toName?: string; subject: string; htmlContent: string; textContent?: string }): Promise<boolean> {
  if (!BREVO_API_KEY) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: opts.to, name: opts.toName ?? opts.to }],
        subject: opts.subject,
        htmlContent: opts.htmlContent,
        textContent: opts.textContent,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildStaffPasswordResetEmail(opts: { firstName: string | null; resetUrl: string }): { subject: string; htmlContent: string; textContent: string } {
  const name = opts.firstName ?? "";
  const greeting = name ? `Hola ${name},` : "Hola,";
  const subject = "Restablece tu contraseña de Tapee Staff";
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="font-family:Arial,sans-serif;background:#f4f4f5;color:#1a1a1a;margin:0;padding:0;"><div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;"><div style="background:linear-gradient(135deg,#0a0a0a,#111827);padding:32px 32px 24px;text-align:center;"><h1 style="color:#00f1ff;font-size:28px;margin:0 0 8px;">Tapee</h1><p style="color:#8b949e;margin:0;font-size:14px;">Portal de Staff</p></div><div style="padding:32px;"><h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;">Restablecer contraseña</h2><p style="color:#52525b;margin:0 0 24px;">${greeting} recibimos una solicitud para restablecer tu contraseña de cuenta de Staff en Tapee. Haz clic en el botón de abajo para crear una nueva.</p><div style="text-align:center;margin:24px 0;"><a href="${opts.resetUrl}" style="display:inline-block;background-color:#00f1ff;color:#000000;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">Restablecer Contraseña</a></div><p style="color:#71717a;font-size:13px;margin:24px 0 0;">Este enlace expira en 1 hora. Si no solicitaste un cambio de contraseña, puedes ignorar este correo.</p></div><div style="padding:16px 32px;background:#f4f4f5;text-align:center;border-top:1px solid #e4e4e7;"><p style="color:#71717a;font-size:12px;margin:0;">&copy; Tapee &middot; Eventos cashless</p></div></div></body></html>`;
  const textContent = `${greeting}\n\nRecibimos una solicitud para restablecer tu contraseña de cuenta de Staff en Tapee.\n\nRestablece tu contraseña aquí:\n${opts.resetUrl}\n\nEste enlace expira en 1 hora. Si no solicitaste un cambio de contraseña, ignora este correo.\n\n— El equipo de Tapee`;
  return { subject, htmlContent, textContent };
}

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const profileData = {
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values({ id: claims.sub as string, ...profileData })
    .onConflictDoUpdate({
      target: usersTable.id,
      // On re-login, update profile fields but NOT role (role is admin-managed)
      set: {
        ...profileData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }

  const u = req.user;
  let merchantName: string | null = null;
  let merchantType: string | null = null;
  let eventName: string | null = null;
  let ticketingEnabled: boolean | null = null;
  let nfcBraceletsEnabled: boolean | null = null;

  try {
    if (u.merchantId) {
      const [merchant] = await db
        .select({ name: merchantsTable.name, merchantType: merchantsTable.merchantType })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, u.merchantId));
      merchantName = merchant?.name ?? null;
      merchantType = merchant?.merchantType ?? null;
    }
    if (u.eventId) {
      const [event] = await db
        .select({ name: eventsTable.name, ticketingEnabled: eventsTable.ticketingEnabled, nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled })
        .from(eventsTable)
        .where(eq(eventsTable.id, u.eventId));
      eventName = event?.name ?? null;
      ticketingEnabled = event?.ticketingEnabled ?? null;
      nfcBraceletsEnabled = event?.nfcBraceletsEnabled ?? null;
    }
  } catch {
    // Non-fatal: names are display-only
  }

  res.json({
    ...GetCurrentAuthUserResponse.parse({ user: u }),
    user: {
      ...GetCurrentAuthUserResponse.parse({ user: u }).user,
      merchantName,
      merchantType,
      eventName,
      gateZoneId: (u as unknown as { gateZoneId?: string | null }).gateZoneId ?? null,
      ticketingEnabled,
      nfcBraceletsEnabled,
    },
  });
});


const StaffLoginBody = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const STAFF_ROLES = ["bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin", "ticketing_auditor"] as const;

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = StaffLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username/email and password are required" });
    return;
  }

  const { identifier, password } = parsed.data;
  const lower = identifier.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(
      eq(usersTable.email, lower),
      eq(usersTable.username, lower),
    ));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "Tu cuenta ha sido bloqueada. Contacta al administrador del evento." });
    return;
  }

  if (user.isSuspended) {
    res.status(403).json({ error: "ACCOUNT_SUSPENDED: Tu cuenta está suspendida temporalmente. Contacta al administrador." });
    return;
  }

  if (!(STAFF_ROLES as readonly string[]).includes(user.role)) {
    res.status(403).json({ error: "Attendee accounts must log in via the attendee app" });
    return;
  }

  // ticketing_auditor accounts MUST have a TOTP secret provisioned before they
  // can log in. The secret is provisioned by an admin via /auditors/:id/setup-totp.
  // If totpSecret exists but totpEnabled is false, we allow the 2FA challenge so
  // the auditor can confirm their code (which activates TOTP on success).
  if (user.role === "ticketing_auditor" && !user.totpSecret) {
    res.status(403).json({ error: "TOTP_SETUP_REQUIRED: Tu cuenta de auditor requiere configurar autenticación de dos factores (2FA) antes de poder iniciar sesión. Contacta al administrador." });
    return;
  }

  // ticketing_auditor accounts always require a TOTP challenge when a secret exists
  // (including unconfirmed secrets, to support first-time activation).
  // Other staff roles: only challenge when totpEnabled is fully active.
  const requiresTotpChallenge =
    user.role === "ticketing_auditor"
      ? !!user.totpSecret
      : user.totpEnabled && !!user.totpSecret;
  if (requiresTotpChallenge) {
    const partialToken = await createPartialSession(user.id);
    res.json({ requires_2fa: true, partial_token: partialToken });
    return;
  }

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

const DEMO_ROLES = ["bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin", "box_office"] as const;
const DemoLoginBody = z.object({
  role: z.enum(DEMO_ROLES),
  secret: z.string().min(1),
});

router.post("/auth/demo-login", async (req: Request, res: Response) => {
  const demoSecret = process.env.DEMO_SECRET;
  if (!demoSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const parsed = DemoLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { role, secret } = parsed.data;
  if (secret !== demoSecret) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }

  const username = `demo_${role}`;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(404).json({ error: `Demo account for role '${role}' not found. Run the demo seed SQL first.` });
    return;
  }

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

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ success: true });
});

// ── Staff forgot-password ────────────────────────────────────────────────────

const StaffForgotPasswordBody = z.object({
  email: z.string().email(),
});

const STAFF_ROLES_FOR_RESET = ["bank", "gate", "merchant_staff", "merchant_admin", "warehouse_admin", "event_admin", "admin", "ticketing_auditor"] as const;

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const parsed = StaffForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const { email } = parsed.data;
  const lower = email.toLowerCase().trim();

  // Always 200 to prevent user enumeration
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, lower));

  if (user && (STAFF_ROLES_FOR_RESET as readonly string[]).includes(user.role)) {
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokensTable).values({ token, userId: user.id, expiresAt });

      const staffAppUrl = process.env.STAFF_APP_URL;
      if (!staffAppUrl) {
        throw new Error("STAFF_APP_URL env var is not configured");
      }
      const resetUrl = `${staffAppUrl.replace(/\/$/, "")}/reset-password?token=${token}&source=admin`;
      const emailContent = buildStaffPasswordResetEmail({ firstName: user.firstName, resetUrl });
      await sendEmail({
        to: lower,
        toName: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
        ...emailContent,
      });
    } catch {
      // Non-fatal — don't leak errors
    }
  }

  res.json({ message: "If a staff account with that email exists, a reset link has been sent." });
});

const StaffResetPasswordBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const parsed = StaffResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Token and new password (min 8 chars) are required" });
    return;
  }

  const { token, password } = parsed.data;

  const [resetToken] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, token));

  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const passwordHash = await hashPassword(password, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, resetToken.userId));

    await tx
      .update(passwordResetTokensTable)
      .set({ used: true })
      .where(eq(passwordResetTokensTable.token, token));

    // Invalidate all active sessions for the user (defense-in-depth)
    // Sessions store user data in a JSONB 'sess' column as {user:{id:...},...}
    const userFilter = JSON.stringify({ user: { id: resetToken.userId } });
    await tx
      .delete(sessionsTable)
      .where(drizzleSql`${sessionsTable.sess} @> ${userFilter}::jsonb`);
  });

  res.json({ message: "Password updated successfully. You can now log in." });
});

const SetupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

router.post("/auth/setup", async (req: Request, res: Response) => {
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!setupToken) {
    res.status(403).json({ error: "Setup is not available." });
    return;
  }

  const providedToken = req.headers["x-setup-token"] as string | undefined;
  if (!providedToken || providedToken !== setupToken) {
    res.status(401).json({ error: "Invalid or missing setup token." });
    return;
  }

  const parsed = SetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existingAdmin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (existingAdmin) {
    delete process.env.ADMIN_SETUP_TOKEN;
    res.status(403).json({ error: "Setup already complete. An admin account already exists." });
    return;
  }

  const { email, password, firstName, lastName } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password, 10);

  const [newUser] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      passwordHash,
      firstName: firstName ?? "Admin",
      lastName: lastName ?? null,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { passwordHash, role: "admin", updatedAt: new Date() },
    })
    .returning();

  delete process.env.ADMIN_SETUP_TOKEN;

  res.status(201).json({ id: newUser.id, email: newUser.email, role: newUser.role });
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role,
      merchantId: dbUser.merchantId ?? null,
      eventId: dbUser.eventId ?? null,
      promoterCompanyId: dbUser.promoterCompanyId ?? null,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: (process.env.CLIENT_ID ?? process.env.REPL_ID)!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

export default router;

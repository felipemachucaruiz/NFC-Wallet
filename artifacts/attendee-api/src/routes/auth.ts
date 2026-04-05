import * as oidc from "openid-client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import {
  db,
  usersTable,
  merchantsTable,
  eventsTable,
  passwordResetTokensTable,
  emailVerificationTokensTable,
} from "@workspace/db";
import { and, eq, lt, or } from "drizzle-orm";
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
import {
  sendEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "../lib/email";

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
        .select({ name: eventsTable.name })
        .from(eventsTable)
        .where(eq(eventsTable.id, u.eventId));
      eventName = event?.name ?? null;
    }
  } catch {
    // Non-fatal: names are display-only
  }

  // Fetch emailVerified for this user
  let emailVerified = false;
  try {
    const [dbUser] = await db
      .select({ emailVerified: usersTable.emailVerified })
      .from(usersTable)
      .where(eq(usersTable.id, u.id));
    emailVerified = dbUser?.emailVerified ?? false;
  } catch {
    // Non-fatal
  }

  res.json({
    ...GetCurrentAuthUserResponse.parse({ user: u }),
    user: {
      ...GetCurrentAuthUserResponse.parse({ user: u }).user,
      merchantName,
      merchantType,
      eventName,
      gateZoneId: (u as unknown as { gateZoneId?: string | null }).gateZoneId ?? null,
      emailVerified,
    },
  });
});

const PasswordLoginBody = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = PasswordLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username/email and password are required" });
    return;
  }

  const { identifier, password } = parsed.data;
  const trimmed = identifier.trim();
  const lower = trimmed.toLowerCase();

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

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.role !== "attendee") {
    res.status(403).json({ error: "Staff accounts must log in via the staff portal" });
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

const CreateAccountBody = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, underscores, dots, and hyphens").optional(),
  password: z.string().min(6),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().max(30).optional(),
}).refine((d) => d.email || d.username, {
  message: "Either email or username is required",
});

router.post("/auth/create-account", async (req: Request, res: Response) => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { email, username, password, firstName, lastName, phone } = parsed.data;
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const normalizedUsername = username ? username.trim().toLowerCase() : null;

  if (normalizedEmail) {
    const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (dup) { res.status(409).json({ error: "Email already registered" }); return; }
  }
  if (normalizedUsername) {
    const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, normalizedUsername));
    if (dup) { res.status(409).json({ error: "Username already taken" }); return; }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [newUser] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      phone: phone ?? null,
      role: "attendee",
      emailVerified: false,
    })
    .returning();

  // Send email verification if they registered with an email
  if (normalizedEmail) {
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.insert(emailVerificationTokensTable).values({
        token,
        userId: newUser.id,
        expiresAt,
      });

      const origin = getOrigin(req);
      const verifyUrl = `${origin}/api/auth/verify-email?token=${token}`;
      const emailContent = buildVerificationEmail({ firstName: newUser.firstName, verifyUrl });
      await sendEmail({
        to: normalizedEmail,
        toName: [newUser.firstName, newUser.lastName].filter(Boolean).join(" ") || undefined,
        ...emailContent,
      });
    } catch {
      // Non-fatal — account is created, verification email is best-effort
    }
  }

  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    username: newUser.username,
    role: newUser.role,
    emailVerified: newUser.emailVerified,
  });
});

// ── Password reset ──────────────────────────────────────────────────────────

const ForgotPasswordBody = z.object({
  email: z.string().email(),
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const { email } = parsed.data;
  const lower = email.toLowerCase().trim();

  // Always respond 200 to avoid user enumeration
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, lower), eq(usersTable.role, "attendee")));

  if (user) {
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokensTable).values({
        token,
        userId: user.id,
        expiresAt,
      });

      const origin = getOrigin(req);
      const resetUrl = `${origin}/attendee-app/reset-password?token=${token}`;
      const emailContent = buildPasswordResetEmail({ firstName: user.firstName, resetUrl });
      await sendEmail({
        to: lower,
        toName: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
        ...emailContent,
      });
    } catch {
      // Non-fatal — don't leak errors
    }
  }

  res.json({ message: "If an account with that email exists, a reset link has been sent." });
});

const ResetPasswordBody = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Token and new password (min 6 chars) are required" });
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

  const passwordHash = await bcrypt.hash(password, 12);

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, resetToken.userId));

    await tx
      .update(passwordResetTokensTable)
      .set({ used: true })
      .where(eq(passwordResetTokensTable.token, token));
  });

  res.json({ message: "Password updated successfully. You can now log in." });
});

// ── Email verification ──────────────────────────────────────────────────────

router.get("/auth/verify-email", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;

  if (!token) {
    res.status(400).json({ error: "Verification token is required" });
    return;
  }

  const [verifyToken] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token));

  if (!verifyToken || verifyToken.used || verifyToken.expiresAt < new Date()) {
    res.status(400).json({ error: "This verification link is invalid or has expired" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(usersTable.id, verifyToken.userId));

    await tx
      .update(emailVerificationTokensTable)
      .set({ used: true })
      .where(eq(emailVerificationTokensTable.token, token));
  });

  // Redirect to the app with a success indicator
  const origin = getOrigin(req);
  res.redirect(`${origin}/attendee-app/?emailVerified=1`);
});

router.post("/auth/resend-verification", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user || !user.email) {
    res.status(400).json({ error: "No email address on file" });
    return;
  }

  if (user.emailVerified) {
    res.status(400).json({ error: "Email is already verified" });
    return;
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(emailVerificationTokensTable).values({
      token,
      userId: user.id,
      expiresAt,
    });

    const origin = getOrigin(req);
    const verifyUrl = `${origin}/api/auth/verify-email?token=${token}`;
    const emailContent = buildVerificationEmail({ firstName: user.firstName, verifyUrl });
    await sendEmail({
      to: user.email,
      toName: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
      ...emailContent,
    });

    res.json({ message: "Verification email sent" });
  } catch {
    res.status(500).json({ error: "Failed to send verification email" });
  }
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

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
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
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;

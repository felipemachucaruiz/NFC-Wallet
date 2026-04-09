import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL =
  process.env.OIDC_ISSUER_URL ??
  process.env.ISSUER_URL ??
  "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

const SESSION_CACHE_TTL = 60 * 1000;
const SESSION_CACHE_MAX = 5000;
const sessionCache = new Map<string, { data: SessionData; expiresAt: number }>();

function cacheGet(sid: string): SessionData | null {
  const entry = sessionCache.get(sid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(sid);
    return null;
  }
  return entry.data;
}

function cacheSet(sid: string, data: SessionData): void {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const first = sessionCache.keys().next().value;
    if (first) sessionCache.delete(first);
  }
  sessionCache.set(sid, { data, expiresAt: Date.now() + SESSION_CACHE_TTL });
}

function cacheDelete(sid: string): void {
  sessionCache.delete(sid);
}

export interface SessionData {
  user: AuthUser;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      (process.env.CLIENT_ID ?? process.env.REPL_ID)!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const cached = cacheGet(sid);
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  const oneDay = 24 * 60 * 60 * 1000;
  if (row.expire.getTime() - Date.now() < SESSION_TTL - oneDay) {
    await db
      .update(sessionsTable)
      .set({ expire: new Date(Date.now() + SESSION_TTL) })
      .where(eq(sessionsTable.sid, sid));
  }

  const data = row.sess as unknown as SessionData;
  cacheSet(sid, data);
  return data;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  cacheDelete(sid);
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}

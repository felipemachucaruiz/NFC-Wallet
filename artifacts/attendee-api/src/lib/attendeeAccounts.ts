import crypto from "crypto";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getAppUrl } from "./email";

export async function findOrCreateAttendeeAccount(
  email: string,
  name: string,
  phone?: string | null,
): Promise<{ userId: string; isNew: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (existingUser) {
    return { userId: existingUser.id, isNew: false };
  }

  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? name;
  const lastName = nameParts.slice(1).join(" ") || null;

  const [newUser] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      firstName,
      lastName,
      phone: phone ?? null,
      role: "attendee",
      emailVerified: true,
      passwordHash: null,
    })
    .returning();

  logger.info({ userId: newUser.id, email: normalizedEmail }, "Auto-created attendee account from ticket purchase");
  return { userId: newUser.id, isNew: true };
}

export async function generateActivationToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(passwordResetTokensTable).values({
    token,
    userId,
    expiresAt,
  });
  return token;
}

export function buildActivationUrl(token: string): string {
  const appUrl = getAppUrl() || process.env.APP_URL || "";
  return `${appUrl}/api/auth/activate-account?token=${token}`;
}

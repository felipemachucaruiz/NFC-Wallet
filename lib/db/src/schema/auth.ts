import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "attendee",
  "bank",
  "merchant_staff",
  "merchant_admin",
  "warehouse_admin",
  "event_admin",
  "gate",
  "admin",
]);

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"),
  role: userRoleEnum("role").notNull().default("attendee"),
  merchantId: varchar("merchant_id"),
  eventId: varchar("event_id"),
  promoterCompanyId: varchar("promoter_company_id"),
  expoPushToken: varchar("expo_push_token"),
  phone: varchar("phone", { length: 30 }),
  dateOfBirth: varchar("date_of_birth", { length: 10 }),
  sex: varchar("sex", { length: 10 }),
  idDocument: varchar("id_document", { length: 50 }),
  /**
   * Gate/wristband staff: nullable FK to access_zones.id.
   * The DB-level FK constraint (users_gate_zone_id_fk) is created directly via SQL migration
   * to avoid the circular Drizzle schema import that would result from auth.ts → accessZones.ts → auth.ts.
   * App logic validates zone existence and ownership during assignment.
   */
  gateZoneId: varchar("gate_zone_id"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  // Email verification
  emailVerified: boolean("email_verified").notNull().default(false),
  // TOTP 2FA (admin/merchant-admin only)
  totpSecret: varchar("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    token: varchar("token").primaryKey(),
    userId: varchar("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("IDX_password_reset_tokens_user_id").on(table.userId)],
);

export const emailVerificationTokensTable = pgTable(
  "email_verification_tokens",
  {
    token: varchar("token").primaryKey(),
    userId: varchar("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("IDX_email_verification_tokens_user_id").on(table.userId)],
);

export const partialSessionsTable = pgTable(
  "partial_sessions",
  {
    sid: varchar("sid").primaryKey(),
    userId: varchar("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect;

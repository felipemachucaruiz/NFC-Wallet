import { pgTable, varchar, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const braceletsTable = pgTable("bracelets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nfcUid: varchar("nfc_uid", { length: 64 }).notNull().unique(),
  eventId: varchar("event_id"),
  attendeeName: varchar("attendee_name", { length: 255 }),
  lastKnownBalanceCop: integer("last_known_balance_cop").notNull().default(0),
  lastCounter: integer("last_counter").notNull().default(0),
  flagged: boolean("flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Bracelet = typeof braceletsTable.$inferSelect;
export type InsertBracelet = typeof braceletsTable.$inferInsert;

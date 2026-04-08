import { pgEnum, pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const refundMethodEnum = pgEnum("refund_method", [
  "cash",
  "nequi",
  "bancolombia",
  "other",
]);

export const refundsTable = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  eventId: varchar("event_id").notNull(),
  amount: integer("amount").notNull(),
  refundMethod: refundMethodEnum("refund_method").notNull(),
  notes: text("notes"),
  performedByUserId: varchar("performed_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Refund = typeof refundsTable.$inferSelect;
export type InsertRefund = typeof refundsTable.$inferInsert;

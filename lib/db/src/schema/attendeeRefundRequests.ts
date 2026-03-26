import { pgEnum, pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const attendeeRefundMethodEnum = pgEnum("attendee_refund_method", [
  "cash",
  "nequi",
  "bancolombia",
  "other",
]);

export const attendeeRefundRequestStatusEnum = pgEnum("attendee_refund_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const attendeeRefundRequestsTable = pgTable("attendee_refund_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attendeeUserId: varchar("attendee_user_id").notNull().references(() => usersTable.id),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  eventId: varchar("event_id").notNull(),
  amountCop: integer("amount_cop").notNull(),
  refundMethod: attendeeRefundMethodEnum("refund_method").notNull(),
  accountDetails: text("account_details"),
  notes: text("notes"),
  status: attendeeRefundRequestStatusEnum("status").notNull().default("pending"),
  processedByUserId: varchar("processed_by_user_id").references(() => usersTable.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AttendeeRefundRequest = typeof attendeeRefundRequestsTable.$inferSelect;
export type InsertAttendeeRefundRequest = typeof attendeeRefundRequestsTable.$inferInsert;

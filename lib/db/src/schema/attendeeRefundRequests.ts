import { pgEnum, pgTable, uniqueIndex, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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

export const attendeeRefundRequestsTable = pgTable(
  "attendee_refund_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    attendeeUserId: varchar("attendee_user_id").notNull().references(() => usersTable.id),
    braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
    eventId: varchar("event_id").notNull(),
    amountCop: integer("amount_cop").notNull(),
    refundMethod: attendeeRefundMethodEnum("refund_method").notNull(),
    accountDetails: text("account_details"),
    notes: text("notes"),
    status: attendeeRefundRequestStatusEnum("status").notNull().default("pending"),
    chipZeroed: boolean("chip_zeroed").notNull().default(false),
    processedByUserId: varchar("processed_by_user_id").references(() => usersTable.id),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    // Ensures only one pending refund request exists per bracelet at any time.
    // The index is partial (WHERE status='pending') so approved/rejected rows
    // do not conflict — historical records are preserved for auditing.
    // This index already exists in production: CREATE UNIQUE INDEX uniq_pending_refund_per_bracelet
    // ON attendee_refund_requests(bracelet_uid) WHERE status='pending';
    uniqPendingRefundPerBracelet: uniqueIndex("uniq_pending_refund_per_bracelet")
      .on(t.braceletUid)
      .where(sql`${t.status} = 'pending'`),
  })
);

export type AttendeeRefundRequest = typeof attendeeRefundRequestsTable.$inferSelect;
export type InsertAttendeeRefundRequest = typeof attendeeRefundRequestsTable.$inferInsert;

import { pgEnum, pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";
import { usersTable } from "./auth";

export const fraudAlertTypeEnum = pgEnum("fraud_alert_type", [
  "double_location",
  "offline_volume_anomaly",
  "high_value_staff",
  "balance_increase_no_topup",
  "manual_report",
  "hmac_invalid",
]);

export const fraudAlertSeverityEnum = pgEnum("fraud_alert_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const fraudAlertEntityTypeEnum = pgEnum("fraud_alert_entity_type", [
  "bracelet",
  "pos",
  "staff",
]);

export const fraudAlertStatusEnum = pgEnum("fraud_alert_status", [
  "open",
  "reviewed",
  "dismissed",
]);

export const fraudAlertsTable = pgTable("fraud_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  type: fraudAlertTypeEnum("type").notNull(),
  severity: fraudAlertSeverityEnum("severity").notNull(),
  entityType: fraudAlertEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  description: text("description").notNull(),
  reportedBy: varchar("reported_by").references(() => usersTable.id),
  status: fraudAlertStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FraudAlert = typeof fraudAlertsTable.$inferSelect;
export type InsertFraudAlert = typeof fraudAlertsTable.$inferInsert;

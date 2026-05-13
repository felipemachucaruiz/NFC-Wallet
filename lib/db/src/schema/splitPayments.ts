import { pgEnum, pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";
import { merchantsTable, locationsTable, productsTable } from "./merchants";
import { usersTable } from "./auth";

export const splitPaymentStatusEnum = pgEnum("split_payment_status", [
  "open",
  "completed",
  "cancelled",
]);

export const splitPaymentSessionsTable = pgTable("split_payment_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  merchantId: varchar("merchant_id").notNull().references(() => merchantsTable.id),
  locationId: varchar("location_id").notNull().references(() => locationsTable.id),
  totalAmount: integer("total_amount").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),
  tipAmount: integer("tip_amount").notNull().default(0),
  status: splitPaymentStatusEnum("status").notNull().default("open"),
  openedByUserId: varchar("opened_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export const splitPaymentSessionItemsTable = pgTable("split_payment_session_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => splitPaymentSessionsTable.id),
  productId: varchar("product_id").references(() => productsTable.id),
  productNameSnapshot: varchar("product_name_snapshot", { length: 255 }).notNull(),
  unitPriceSnapshot: integer("unit_price_snapshot").notNull(),
  unitCostSnapshot: integer("unit_cost_snapshot").notNull().default(0),
  quantity: integer("quantity").notNull(),
});

export type SplitPaymentSession = typeof splitPaymentSessionsTable.$inferSelect;
export type SplitPaymentSessionItem = typeof splitPaymentSessionItemsTable.$inferSelect;

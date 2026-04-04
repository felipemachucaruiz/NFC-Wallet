import { pgEnum, pgTable, varchar, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";
import { merchantsTable, locationsTable, productsTable } from "./merchants";
import { usersTable } from "./auth";

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card_external",
  "nequi_transfer",
  "bancolombia_transfer",
  "nequi",
  "pse",
  "other",
]);

export const payoutPaymentMethodEnum = pgEnum("payout_payment_method", [
  "transfer",
  "nequi",
  "cash",
  "other",
]);

export const topUpStatusEnum = pgEnum("top_up_status", [
  "pending",
  "completed",
  "failed",
]);

export const transactionLogsTable = pgTable("transaction_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  locationId: varchar("location_id").notNull().references(() => locationsTable.id),
  merchantId: varchar("merchant_id").notNull().references(() => merchantsTable.id),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  grossAmountCop: integer("gross_amount_cop").notNull(),
  tipAmountCop: integer("tip_amount_cop").notNull().default(0),
  commissionAmountCop: integer("commission_amount_cop").notNull(),
  netAmountCop: integer("net_amount_cop").notNull(),
  newBalanceCop: integer("new_balance_cop").notNull(),
  counter: integer("counter").notNull(),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  offlineCreatedAt: timestamp("offline_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionLineItemsTable = pgTable("transaction_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionLogId: varchar("transaction_log_id").notNull().references(() => transactionLogsTable.id),
  productId: varchar("product_id").references(() => productsTable.id),
  productNameSnapshot: varchar("product_name_snapshot", { length: 255 }).notNull(),
  unitPriceSnapshot: integer("unit_price_snapshot").notNull(),
  unitCostSnapshot: integer("unit_cost_snapshot").notNull().default(0),
  quantity: integer("quantity").notNull(),
  ivaAmountCop: integer("iva_amount_cop").notNull().default(0),
  retencionFuenteAmountCop: integer("retencion_fuente_amount_cop").notNull().default(0),
  retencionICAAmountCop: integer("retencion_ica_amount_cop").notNull().default(0),
});

export const topUpsTable = pgTable("top_ups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  amountCop: integer("amount_cop").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  performedByUserId: varchar("performed_by_user_id").notNull().references(() => usersTable.id),
  wompiTransactionId: varchar("wompi_transaction_id"),
  status: topUpStatusEnum("status").notNull().default("completed"),
  newBalanceCop: integer("new_balance_cop").notNull(),
  newCounter: integer("new_counter").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  offlineCreatedAt: timestamp("offline_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantPayoutsTable = pgTable("merchant_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchantsTable.id),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  grossSalesCop: integer("gross_sales_cop").notNull(),
  commissionCop: integer("commission_cop").notNull(),
  netPayoutCop: integer("net_payout_cop").notNull(),
  paymentMethod: payoutPaymentMethodEnum("payment_method").notNull(),
  referenceNote: text("reference_note"),
  performedByUserId: varchar("performed_by_user_id").notNull().references(() => usersTable.id),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TransactionLog = typeof transactionLogsTable.$inferSelect;
export type TransactionLineItem = typeof transactionLineItemsTable.$inferSelect;
export type TopUp = typeof topUpsTable.$inferSelect;
export type MerchantPayout = typeof merchantPayoutsTable.$inferSelect;

import { pgEnum, pgTable, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const wompiPaymentMethodEnum = pgEnum("wompi_payment_method", [
  "nequi",
  "pse",
]);

export const wompiPaymentStatusEnum = pgEnum("wompi_payment_status", [
  "pending",
  "processing",
  "success",
  "failed",
  "expired",
]);

export const wompiPaymentIntentsTable = pgTable("wompi_payment_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  amount: integer("amount").notNull(),
  paymentMethod: wompiPaymentMethodEnum("payment_method").notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  bankCode: varchar("bank_code", { length: 20 }),
  wompiTransactionId: varchar("wompi_transaction_id"),
  wompiReference: varchar("wompi_reference"),
  redirectUrl: text("redirect_url"),
  status: wompiPaymentStatusEnum("status").notNull().default("pending"),
  topUpId: varchar("top_up_id"),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  selfService: boolean("self_service").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WompiPaymentIntent = typeof wompiPaymentIntentsTable.$inferSelect;
export type InsertWompiPaymentIntent = typeof wompiPaymentIntentsTable.$inferInsert;

import { pgEnum, pgTable, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const wompiPaymentMethodEnum = pgEnum("wompi_payment_method", [
  "nequi",
  "pse",
  "card",
  "bancolombia_transfer",
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
  braceletUid: varchar("bracelet_uid", { length: 64 }),
  amount: integer("amount").notNull(),
  paymentMethod: wompiPaymentMethodEnum("payment_method").notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  bankCode: varchar("bank_code", { length: 20 }),
  wompiTransactionId: varchar("wompi_transaction_id"),
  wompiReference: varchar("wompi_reference"),
  redirectUrl: text("redirect_url"),
  status: wompiPaymentStatusEnum("status").notNull().default("pending"),
  topUpId: varchar("top_up_id"),
  ticketOrderId: varchar("ticket_order_id"),
  purposeType: varchar("purpose_type", { length: 20 }).notNull().default("topup"),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  selfService: boolean("self_service").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WompiPaymentIntent = typeof wompiPaymentIntentsTable.$inferSelect;
export type InsertWompiPaymentIntent = typeof wompiPaymentIntentsTable.$inferInsert;

export const savedCardsTable = pgTable("saved_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  wompiToken: varchar("wompi_token", { length: 256 }).notNull(),
  brand: varchar("brand", { length: 30 }).notNull(),
  lastFour: varchar("last_four", { length: 4 }).notNull(),
  cardHolderName: varchar("card_holder_name", { length: 255 }).notNull(),
  expiryMonth: varchar("expiry_month", { length: 2 }).notNull(),
  expiryYear: varchar("expiry_year", { length: 4 }).notNull(),
  alias: varchar("alias", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SavedCard = typeof savedCardsTable.$inferSelect;
export type InsertSavedCard = typeof savedCardsTable.$inferInsert;

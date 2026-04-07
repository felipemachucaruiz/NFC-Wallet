import { pgEnum, pgTable, varchar, text, timestamp, boolean, integer, numeric, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";

export const merchantTypeEnum = pgEnum("merchant_type", ["event_managed", "external"]);

export const merchantsTable = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  commissionRatePercent: numeric("commission_rate_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  merchantType: merchantTypeEnum("merchant_type").notNull().default("event_managed"),
  active: boolean("active").notNull().default(true),
  retencionFuenteRate: numeric("retencion_fuente_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  retencionICARate: numeric("retencion_ica_rate", { precision: 7, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const locationsTable = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchantsTable.id),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productsTable = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchantsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  priceCop: integer("price_cop").notNull(),
  costCop: integer("cost_cop").notNull().default(0),
  ivaRate: numeric("iva_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  ivaExento: boolean("iva_exento").notNull().default(false),
  active: boolean("active").notNull().default(true),
  imageUrl: varchar("image_url", { length: 1024 }),
  barcode: varchar("barcode", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const locationInventoryTable = pgTable("location_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locationsTable.id),
  productId: varchar("product_id").notNull().references(() => productsTable.id),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  restockTrigger: integer("restock_trigger").notNull().default(10),
  restockTargetQty: integer("restock_target_qty").notNull().default(50),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("location_inventory_qty_non_negative", sql`${table.quantityOnHand} >= 0`),
]);

export const userLocationAssignmentsTable = pgTable("user_location_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  locationId: varchar("location_id").notNull().references(() => locationsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Merchant = typeof merchantsTable.$inferSelect;
export type InsertMerchant = typeof merchantsTable.$inferInsert;
export type Location = typeof locationsTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;

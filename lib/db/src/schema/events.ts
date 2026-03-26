import { pgEnum, pgTable, varchar, text, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const inventoryModeEnum = pgEnum("inventory_mode", ["location_based", "centralized_warehouse"]);

export const eventsTable = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  venueAddress: varchar("venue_address", { length: 500 }),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  platformCommissionRate: numeric("platform_commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  capacity: integer("capacity"),
  promoterCompanyId: varchar("promoter_company_id"),
  pulepId: varchar("pulep_id", { length: 100 }),
  inventoryMode: inventoryModeEnum("inventory_mode").notNull().default("location_based"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const warehousesTable = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const warehouseInventoryTable = pgTable("warehouse_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehousesTable.id),
  productId: varchar("product_id").notNull(),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
export type Warehouse = typeof warehousesTable.$inferSelect;
export type InsertWarehouse = typeof warehousesTable.$inferInsert;

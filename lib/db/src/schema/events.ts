import { pgEnum, pgTable, varchar, text, timestamp, boolean, integer, numeric, index, jsonb, decimal, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const inventoryModeEnum = pgEnum("inventory_mode", ["location_based", "centralized_warehouse"]);

export const nfcChipTypeEnum = pgEnum("nfc_chip_type", ["ntag_21x", "mifare_classic", "desfire_ev3", "mifare_ultralight_c"]);

export const eventsTable = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 300 }),
  description: text("description"),
  venueAddress: varchar("venue_address", { length: 500 }),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  refundDeadline: timestamp("refund_deadline", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  currencyCode: varchar("currency_code", { length: 10 }).notNull().default("COP"),
  platformCommissionRate: numeric("platform_commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  capacity: integer("capacity"),
  promoterCompanyId: varchar("promoter_company_id"),
  pulepId: varchar("pulep_id", { length: 100 }),
  inventoryMode: inventoryModeEnum("inventory_mode").notNull().default("location_based"),
  hmacSecret: varchar("hmac_secret", { length: 128 }),
  useKdf: boolean("use_kdf").notNull().default(true),
  nfcChipType: nfcChipTypeEnum("nfc_chip_type").notNull().default("ntag_21x"),
  allowedNfcTypes: jsonb("allowed_nfc_types").$type<string[]>().notNull().default(sql`'["ntag_21x"]'::jsonb`),
  offlineSyncLimit: integer("offline_sync_limit").notNull().default(500000),
  maxOfflineSpendPerBracelet: integer("max_offline_spend_per_bracelet").notNull().default(200000),
  desfireAesKey: varchar("desfire_aes_key", { length: 64 }),
  ultralightCDesKey: varchar("ultralight_c_des_key", { length: 32 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  bankPaymentMethods: jsonb("bank_payment_methods").$type<string[]>().notNull().default(sql`'["cash","card_external","nequi_transfer","bancolombia_transfer","other"]'::jsonb`),
  boxOfficePaymentMethods: jsonb("box_office_payment_methods").$type<string[]>().notNull().default(sql`'["gate_cash","gate_transfer","gate_card","gate_nequi"]'::jsonb`),
  bankMinTopup: integer("bank_min_topup").notNull().default(0),
  ticketingEnabled: boolean("ticketing_enabled").notNull().default(false),
  nfcBraceletsEnabled: boolean("nfc_bracelets_enabled").notNull().default(true),
  salesChannel: varchar("sales_channel", { length: 20 }).notNull().default("both"),
  saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  coverImageUrl: varchar("cover_image_url", { length: 1000 }),
  flyerImageUrl: varchar("flyer_image_url", { length: 1000 }),
  longDescription: text("long_description"),
  category: varchar("category", { length: 100 }),
  tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`),
  minAge: integer("min_age"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_events_promoter_company_id").on(table.promoterCompanyId),
  index("idx_events_slug").on(table.slug),
]);

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 10 }).notNull(),
  rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
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
}, (table) => [
  check("warehouse_inventory_qty_non_negative", sql`${table.quantityOnHand} >= 0`),
]);

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
export type Warehouse = typeof warehousesTable.$inferSelect;
export type InsertWarehouse = typeof warehousesTable.$inferInsert;

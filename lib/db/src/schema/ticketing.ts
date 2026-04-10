import { pgEnum, pgTable, varchar, text, timestamp, boolean, integer, numeric, index, jsonb, unique, check, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";
import { usersTable } from "./auth";

export const salesChannelEnum = pgEnum("sales_channel", ["online", "door", "both"]);

export const ticketOrderStatusEnum = pgEnum("ticket_order_status", [
  "pending",
  "confirmed",
  "cancelled",
  "expired",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "valid",
  "used",
  "cancelled",
]);

export const eventDaysTable = pgTable("event_days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  date: date("date").notNull(),
  label: varchar("label", { length: 255 }),
  doorsOpenAt: timestamp("doors_open_at", { withTimezone: true }),
  doorsCloseAt: timestamp("doors_close_at", { withTimezone: true }),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_event_days_event_id").on(table.eventId),
]);

export const venuesTable = pgTable("venues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 255 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  floorplanImageUrl: text("floorplan_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_venues_event_id").on(table.eventId),
]);

export const venueSectionsTable = pgTable("venue_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  venueId: varchar("venue_id").notNull().references(() => venuesTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  capacity: integer("capacity"),
  totalTickets: integer("total_tickets").notNull().default(0),
  soldTickets: integer("sold_tickets").notNull().default(0),
  colorHex: varchar("color_hex", { length: 9 }).default("#6366F1"),
  sectionType: varchar("section_type", { length: 100 }),
  svgPathData: text("svg_path_data"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_venue_sections_venue_id").on(table.venueId),
  check("venue_sections_sold_non_negative", sql`${table.soldTickets} >= 0`),
]);

export const unitStatusEnum = pgEnum("unit_status", ["available", "reserved", "sold"]);

export const ticketTypesTable = pgTable("ticket_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  sectionId: varchar("section_id").references(() => venueSectionsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  serviceFee: integer("service_fee").notNull().default(0),
  quantity: integer("quantity").notNull(),
  soldCount: integer("sold_count").notNull().default(0),
  saleStart: timestamp("sale_start", { withTimezone: true }),
  saleEnd: timestamp("sale_end", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  isNumberedUnits: boolean("is_numbered_units").notNull().default(false),
  unitLabel: varchar("unit_label", { length: 100 }),
  ticketsPerUnit: integer("tickets_per_unit"),
  validEventDayIds: jsonb("valid_event_day_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_ticket_types_event_id").on(table.eventId),
  check("ticket_types_sold_non_negative", sql`${table.soldCount} >= 0`),
]);

export const ticketTypeUnitsTable = pgTable("ticket_type_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketTypeId: varchar("ticket_type_id").notNull().references(() => ticketTypesTable.id, { onDelete: "cascade" }),
  unitNumber: integer("unit_number").notNull(),
  unitLabel: varchar("unit_label", { length: 255 }).notNull(),
  status: unitStatusEnum("status").notNull().default("available"),
  orderId: varchar("order_id").references(() => ticketOrdersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ticket_type_units_ticket_type_id").on(table.ticketTypeId),
  unique("ticket_type_units_type_number_unique").on(table.ticketTypeId, table.unitNumber),
]);

export const ticketOrdersTable = pgTable("ticket_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  buyerUserId: varchar("buyer_user_id").references(() => usersTable.id),
  buyerEmail: varchar("buyer_email", { length: 320 }).notNull(),
  buyerName: varchar("buyer_name", { length: 255 }),
  totalAmount: integer("total_amount").notNull(),
  ticketCount: integer("ticket_count").notNull(),
  paymentStatus: ticketOrderStatusEnum("payment_status").notNull().default("pending"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  wompiTransactionId: varchar("wompi_transaction_id"),
  wompiReference: varchar("wompi_reference"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_ticket_orders_event_id").on(table.eventId),
  index("idx_ticket_orders_buyer_user_id").on(table.buyerUserId),
  index("idx_ticket_orders_wompi_transaction_id").on(table.wompiTransactionId),
]);

export const ticketsTable = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => ticketOrdersTable.id),
  ticketTypeId: varchar("ticket_type_id").references(() => ticketTypesTable.id),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  unitId: varchar("unit_id").references(() => ticketTypeUnitsTable.id),
  attendeeName: varchar("attendee_name", { length: 255 }).notNull(),
  attendeeEmail: varchar("attendee_email", { length: 320 }).notNull(),
  attendeePhone: varchar("attendee_phone", { length: 30 }),
  attendeeUserId: varchar("attendee_user_id").references(() => usersTable.id),
  qrCodeToken: varchar("qr_code_token", { length: 512 }).unique(),
  status: ticketStatusEnum("status").notNull().default("valid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_tickets_order_id").on(table.orderId),
  index("idx_tickets_event_id").on(table.eventId),
  index("idx_tickets_attendee_email").on(table.attendeeEmail),
  index("idx_tickets_attendee_user_id").on(table.attendeeUserId),
]);

export const ticketPricingStagesTable = pgTable("ticket_pricing_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketTypeId: varchar("ticket_type_id").notNull().references(() => ticketTypesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  price: integer("price").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ticket_pricing_stages_ticket_type_id").on(table.ticketTypeId),
]);

export const ticketCheckInsTable = pgTable("ticket_check_ins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => ticketsTable.id),
  eventDayId: varchar("event_day_id").notNull().references(() => eventDaysTable.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
  braceletUid: varchar("bracelet_uid", { length: 64 }),
}, (table) => [
  unique("ticket_check_ins_ticket_day_unique").on(table.ticketId, table.eventDayId),
  index("idx_ticket_check_ins_ticket_id").on(table.ticketId),
]);

export const guestListStatusEnum = pgEnum("guest_list_status", ["active", "closed"]);

export const guestListsTable = pgTable("guest_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => eventsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  maxGuests: integer("max_guests").notNull(),
  currentCount: integer("current_count").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(false),
  status: guestListStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_guest_lists_event_id").on(table.eventId),
  index("idx_guest_lists_slug").on(table.slug),
  check("guest_lists_count_non_negative", sql`${table.currentCount} >= 0`),
]);

export const guestListEntriesTable = pgTable("guest_list_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestListId: varchar("guest_list_id").notNull().references(() => guestListsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  ticketId: varchar("ticket_id").references(() => ticketsTable.id),
  orderId: varchar("order_id").references(() => ticketOrdersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_guest_list_entries_guest_list_id").on(table.guestListId),
  index("idx_guest_list_entries_email").on(table.email),
  unique("guest_list_entries_list_email_unique").on(table.guestListId, table.email),
]);

export type EventDay = typeof eventDaysTable.$inferSelect;
export type InsertEventDay = typeof eventDaysTable.$inferInsert;
export type Venue = typeof venuesTable.$inferSelect;
export type InsertVenue = typeof venuesTable.$inferInsert;
export type VenueSection = typeof venueSectionsTable.$inferSelect;
export type InsertVenueSection = typeof venueSectionsTable.$inferInsert;
export type TicketType = typeof ticketTypesTable.$inferSelect;
export type InsertTicketType = typeof ticketTypesTable.$inferInsert;
export type TicketTypeUnit = typeof ticketTypeUnitsTable.$inferSelect;
export type InsertTicketTypeUnit = typeof ticketTypeUnitsTable.$inferInsert;
export type TicketOrder = typeof ticketOrdersTable.$inferSelect;
export type InsertTicketOrder = typeof ticketOrdersTable.$inferInsert;
export type Ticket = typeof ticketsTable.$inferSelect;
export type InsertTicket = typeof ticketsTable.$inferInsert;
export type TicketPricingStage = typeof ticketPricingStagesTable.$inferSelect;
export type InsertTicketPricingStage = typeof ticketPricingStagesTable.$inferInsert;
export type TicketCheckIn = typeof ticketCheckInsTable.$inferSelect;
export type InsertTicketCheckIn = typeof ticketCheckInsTable.$inferInsert;
export type GuestList = typeof guestListsTable.$inferSelect;
export type InsertGuestList = typeof guestListsTable.$inferInsert;
export type GuestListEntry = typeof guestListEntriesTable.$inferSelect;
export type InsertGuestListEntry = typeof guestListEntriesTable.$inferInsert;

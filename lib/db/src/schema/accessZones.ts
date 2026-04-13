import { pgTable, varchar, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventsTable } from "./events";
import { usersTable } from "./auth";
import { braceletsTable } from "./bracelets";
import { venueSectionsTable } from "./ticketing";

export const accessZonesTable = pgTable(
  "access_zones",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: varchar("event_id").notNull().references(() => eventsTable.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    colorHex: varchar("color_hex", { length: 9 }).default("#6366F1"),
    rank: integer("rank").notNull(),
    upgradePrice: integer("upgrade_price"),
    sourceSectionId: varchar("source_section_id").references(() => venueSectionsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("access_zones_event_id_rank_unique").on(table.eventId, table.rank),
  ],
);

export type AccessZone = typeof accessZonesTable.$inferSelect;
export type InsertAccessZone = typeof accessZonesTable.$inferInsert;

export const accessUpgradesTable = pgTable("access_upgrades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  braceletId: varchar("bracelet_id").notNull().references(() => braceletsTable.id),
  zoneIdsAdded: text("zone_ids_added").array().notNull().default(sql`'{}'::text[]`),
  performedByUserId: varchar("performed_by_user_id").notNull().references(() => usersTable.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccessUpgrade = typeof accessUpgradesTable.$inferSelect;
export type InsertAccessUpgrade = typeof accessUpgradesTable.$inferInsert;

import { pgTable, varchar, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";
import { eventsTable } from "./events";
import { braceletsTable } from "./bracelets";

export const ticketCheckinsTable = pgTable(
  "ticket_checkins",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ticketId: varchar("ticket_id", { length: 255 }).notNull(),
    eventId: varchar("event_id").notNull().references(() => eventsTable.id),
    eventDayIndex: integer("event_day_index").notNull(),
    attendeeUserId: varchar("attendee_user_id").notNull().references(() => usersTable.id),
    braceletId: varchar("bracelet_id").references(() => braceletsTable.id),
    braceletNfcUid: varchar("bracelet_nfc_uid", { length: 64 }),
    accessZoneId: varchar("access_zone_id"),
    section: varchar("section", { length: 255 }),
    ticketType: varchar("ticket_type", { length: 100 }),
    checkedInByUserId: varchar("checked_in_by_user_id").notNull().references(() => usersTable.id),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ticket_checkins_event_ticket_day_unique").on(table.eventId, table.ticketId, table.eventDayIndex),
  ],
);

export type TicketCheckin = typeof ticketCheckinsTable.$inferSelect;
export type InsertTicketCheckin = typeof ticketCheckinsTable.$inferInsert;

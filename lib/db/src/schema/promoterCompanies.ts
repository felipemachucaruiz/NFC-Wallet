import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const promoterCompaniesTable = pgTable("promoter_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  nit: varchar("nit", { length: 50 }),
  address: varchar("address", { length: 500 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PromoterCompany = typeof promoterCompaniesTable.$inferSelect;
export type InsertPromoterCompany = typeof promoterCompaniesTable.$inferInsert;

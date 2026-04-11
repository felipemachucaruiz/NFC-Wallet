import { pgTable, pgEnum, varchar, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const whatsappTriggerTypeEnum = pgEnum("whatsapp_trigger_type", [
  "ticket_purchased",
  "otp_verification",
  "event_reminder",
  "ticket_refund",
  "welcome_message",
  "custom",
]);

export const whatsappTemplateCategoryEnum = pgEnum("whatsapp_template_category", [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
]);

export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", [
  "active",
  "inactive",
  "pending_approval",
]);

export const whatsappTemplatesTable = pgTable("whatsapp_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  gupshupTemplateId: varchar("gupshup_template_id", { length: 255 }).notNull(),
  description: text("description"),
  language: varchar("language", { length: 10 }).notNull().default("es"),
  category: whatsappTemplateCategoryEnum("category").notNull().default("UTILITY"),
  status: whatsappTemplateStatusEnum("status").notNull().default("active"),
  parameters: jsonb("parameters").$type<Array<{ name: string; description: string; example?: string }>>().notNull().default(sql`'[]'::jsonb`),
  bodyPreview: text("body_preview"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappTriggerMappingsTable = pgTable("whatsapp_trigger_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerType: whatsappTriggerTypeEnum("trigger_type").notNull(),
  templateId: varchar("template_id").references(() => whatsappTemplatesTable.id, { onDelete: "cascade" }).notNull(),
  eventId: varchar("event_id"),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

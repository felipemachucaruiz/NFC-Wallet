import { pgTable, pgEnum, varchar, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", [
  "sent",
  "failed",
  "pending",
]);

export const whatsappMessageTypeEnum = pgEnum("whatsapp_message_type", [
  "template",
  "text",
  "document",
  "image",
]);

export const whatsappMessageLogTable = pgTable("whatsapp_message_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  destination: varchar("destination", { length: 30 }).notNull(),
  messageType: whatsappMessageTypeEnum("message_type").notNull(),
  templateId: varchar("template_id"),
  templateName: varchar("template_name", { length: 255 }),
  triggerType: varchar("trigger_type", { length: 50 }),
  status: whatsappMessageStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  orderId: varchar("order_id"),
  ticketId: varchar("ticket_id"),
  eventId: varchar("event_id"),
  attendeeName: varchar("attendee_name", { length: 255 }),
  gupshupMessageId: varchar("gupshup_message_id", { length: 255 }),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  parameterMappings: jsonb("parameter_mappings").$type<Array<{ position: number; field: string }>>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

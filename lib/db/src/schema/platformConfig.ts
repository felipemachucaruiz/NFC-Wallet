import { pgTable, varchar, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ALL_WOMPI_PAYMENT_METHODS = [
  "nequi",
  "pse",
  "card",
  "bancolombia_transfer",
  "daviplata",
  "puntoscolombia",
] as const;

export type WompiPaymentMethod = (typeof ALL_WOMPI_PAYMENT_METHODS)[number];

export const platformConfigTable = pgTable("platform_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enabledPaymentMethods: jsonb("enabled_payment_methods")
    .$type<WompiPaymentMethod[]>()
    .notNull()
    .default(sql`'["nequi","pse","card","bancolombia_transfer","daviplata","puntoscolombia"]'::jsonb`),
});

import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const braceletTransferLogsTable = pgTable("bracelet_transfer_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  braceletUid: varchar("bracelet_uid", { length: 64 }).notNull(),
  fromUserId: varchar("from_user_id").notNull().references(() => usersTable.id),
  balanceCop: integer("balance_cop").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BraceletTransferLog = typeof braceletTransferLogsTable.$inferSelect;
export type InsertBraceletTransferLog = typeof braceletTransferLogsTable.$inferInsert;

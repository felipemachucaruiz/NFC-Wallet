import { pgEnum, pgTable, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { warehousesTable } from "./events";
import { locationsTable, productsTable } from "./merchants";
import { usersTable } from "./auth";

export const damagedGoodsReasonEnum = pgEnum("damaged_goods_reason", [
  "damaged",
  "lost",
  "expired",
]);

export const restockOrderStatusEnum = pgEnum("restock_order_status", [
  "pending",
  "approved",
  "dispatched",
  "rejected",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "warehouse_load",
  "warehouse_dispatch",
  "location_transfer_out",
  "location_transfer_in",
  "sale",
  "manual_adjustment",
  "initial_load",
]);

export const restockOrdersTable = pgTable("restock_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locationsTable.id),
  productId: varchar("product_id").notNull().references(() => productsTable.id),
  requestedQty: integer("requested_qty").notNull(),
  status: restockOrderStatusEnum("status").notNull().default("pending"),
  triggeredByTransactionId: varchar("triggered_by_transaction_id"),
  approvedByUserId: varchar("approved_by_user_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovementsTable = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movementType: stockMovementTypeEnum("movement_type").notNull(),
  productId: varchar("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  fromWarehouseId: varchar("from_warehouse_id").references(() => warehousesTable.id),
  toWarehouseId: varchar("to_warehouse_id").references(() => warehousesTable.id),
  fromLocationId: varchar("from_location_id").references(() => locationsTable.id),
  toLocationId: varchar("to_location_id").references(() => locationsTable.id),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  restockOrderId: varchar("restock_order_id").references(() => restockOrdersTable.id),
  transactionLogId: varchar("transaction_log_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryAuditsTable = pgTable("inventory_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").references(() => warehousesTable.id),
  locationId: varchar("location_id").references(() => locationsTable.id),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryAuditItemsTable = pgTable("inventory_audit_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id").notNull().references(() => inventoryAuditsTable.id),
  productId: varchar("product_id").notNull().references(() => productsTable.id),
  systemCount: integer("system_count").notNull(),
  physicalCount: integer("physical_count").notNull(),
  delta: integer("delta").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const damagedGoodsTable = pgTable("damaged_goods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").references(() => warehousesTable.id),
  locationId: varchar("location_id").references(() => locationsTable.id),
  productId: varchar("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  reason: damagedGoodsReasonEnum("reason").notNull(),
  notes: text("notes"),
  performedByUserId: varchar("performed_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RestockOrder = typeof restockOrdersTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type InventoryAudit = typeof inventoryAuditsTable.$inferSelect;
export type InventoryAuditItem = typeof inventoryAuditItemsTable.$inferSelect;
export type DamagedGoods = typeof damagedGoodsTable.$inferSelect;

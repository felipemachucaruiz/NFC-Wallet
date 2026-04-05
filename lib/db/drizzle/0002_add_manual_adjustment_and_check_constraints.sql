ALTER TYPE "public"."stock_movement_type" ADD VALUE 'manual_adjustment';--> statement-breakpoint
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_qty_non_negative" CHECK ("warehouse_inventory"."quantity_on_hand" >= 0);--> statement-breakpoint
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_qty_non_negative" CHECK ("location_inventory"."quantity_on_hand" >= 0);

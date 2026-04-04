CREATE TYPE "public"."user_role" AS ENUM('attendee', 'bank', 'merchant_staff', 'merchant_admin', 'warehouse_admin', 'event_admin', 'gate', 'admin');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode" AS ENUM('location_based', 'centralized_warehouse');--> statement-breakpoint
CREATE TYPE "public"."nfc_chip_type" AS ENUM('ntag_21x', 'mifare_classic', 'desfire_ev3', 'mifare_ultralight_c');--> statement-breakpoint
CREATE TYPE "public"."merchant_type" AS ENUM('event_managed', 'external');--> statement-breakpoint
CREATE TYPE "public"."restock_order_status" AS ENUM('pending', 'approved', 'dispatched', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('warehouse_load', 'warehouse_dispatch', 'location_transfer_out', 'location_transfer_in', 'sale');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card_external', 'nequi_transfer', 'bancolombia_transfer', 'nequi', 'pse', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_payment_method" AS ENUM('transfer', 'nequi', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."top_up_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_method" AS ENUM('cash', 'nequi', 'bancolombia', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendee_refund_method" AS ENUM('cash', 'nequi', 'bancolombia', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendee_refund_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_entity_type" AS ENUM('bracelet', 'pos', 'staff');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_status" AS ENUM('open', 'reviewed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_type" AS ENUM('double_location', 'offline_volume_anomaly', 'high_value_staff', 'balance_increase_no_topup', 'manual_report', 'hmac_invalid');--> statement-breakpoint
CREATE TYPE "public"."wompi_payment_method" AS ENUM('nequi', 'pse');--> statement-breakpoint
CREATE TYPE "public"."wompi_payment_status" AS ENUM('pending', 'processing', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "sessions" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" varchar,
        "username" varchar,
        "first_name" varchar,
        "last_name" varchar,
        "profile_image_url" varchar,
        "password_hash" varchar,
        "role" "user_role" DEFAULT 'attendee' NOT NULL,
        "merchant_id" varchar,
        "event_id" varchar,
        "promoter_company_id" varchar,
        "expo_push_token" varchar,
        "phone" varchar(30),
        "gate_zone_id" varchar,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email"),
        CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "events" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "venue_address" varchar(500),
        "starts_at" timestamp with time zone,
        "ends_at" timestamp with time zone,
        "active" boolean DEFAULT true NOT NULL,
        "platform_commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
        "capacity" integer,
        "promoter_company_id" varchar,
        "pulep_id" varchar(100),
        "inventory_mode" "inventory_mode" DEFAULT 'location_based' NOT NULL,
        "hmac_secret" varchar(128),
        "use_kdf" boolean DEFAULT true NOT NULL,
        "nfc_chip_type" "nfc_chip_type" DEFAULT 'ntag_21x' NOT NULL,
        "allowed_nfc_types" jsonb DEFAULT '["ntag_21x"]'::jsonb NOT NULL,
        "offline_sync_limit" integer DEFAULT 500000 NOT NULL,
        "max_offline_spend_per_bracelet" integer DEFAULT 200000 NOT NULL,
        "desfire_aes_key" varchar(64),
        "ultralight_c_des_key" varchar(32),
        "latitude" numeric(10, 7),
        "longitude" numeric(10, 7),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_inventory" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "warehouse_id" varchar NOT NULL,
        "product_id" varchar NOT NULL,
        "quantity_on_hand" integer DEFAULT 0 NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_inventory" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "location_id" varchar NOT NULL,
        "product_id" varchar NOT NULL,
        "quantity_on_hand" integer DEFAULT 0 NOT NULL,
        "restock_trigger" integer DEFAULT 10 NOT NULL,
        "restock_target_qty" integer DEFAULT 50 NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "merchant_id" varchar NOT NULL,
        "event_id" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "commission_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
        "merchant_type" "merchant_type" DEFAULT 'event_managed' NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "retencion_fuente_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
        "retencion_ica_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "merchant_id" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "category" varchar(100),
        "price_cop" integer NOT NULL,
        "cost_cop" integer DEFAULT 0 NOT NULL,
        "iva_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
        "iva_exento" boolean DEFAULT false NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "image_url" varchar(1024),
        "barcode" varchar(255),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_location_assignments" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "location_id" varchar NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_orders" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "location_id" varchar NOT NULL,
        "product_id" varchar NOT NULL,
        "requested_qty" integer NOT NULL,
        "status" "restock_order_status" DEFAULT 'pending' NOT NULL,
        "triggered_by_transaction_id" varchar,
        "approved_by_user_id" varchar,
        "approved_at" timestamp with time zone,
        "dispatched_at" timestamp with time zone,
        "rejected_at" timestamp with time zone,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "movement_type" "stock_movement_type" NOT NULL,
        "product_id" varchar NOT NULL,
        "quantity" integer NOT NULL,
        "from_warehouse_id" varchar,
        "to_warehouse_id" varchar,
        "from_location_id" varchar,
        "to_location_id" varchar,
        "performed_by_user_id" varchar,
        "restock_order_id" varchar,
        "transaction_log_id" varchar,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bracelets" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "nfc_uid" varchar(64) NOT NULL,
        "event_id" varchar,
        "attendee_user_id" varchar,
        "attendee_name" varchar(255),
        "phone" varchar(32),
        "email" varchar(255),
        "last_known_balance_cop" integer DEFAULT 0 NOT NULL,
        "last_counter" integer DEFAULT 0 NOT NULL,
        "max_offline_spend" integer,
        "flagged" boolean DEFAULT false NOT NULL,
        "flag_reason" text,
        "pending_sync" boolean DEFAULT false NOT NULL,
        "pending_balance_cop" integer DEFAULT 0 NOT NULL,
        "access_zone_ids" text[] DEFAULT '{}'::text[] NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "bracelets_nfc_uid_unique" UNIQUE("nfc_uid")
);
--> statement-breakpoint
CREATE TABLE "merchant_payouts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "merchant_id" varchar NOT NULL,
        "event_id" varchar NOT NULL,
        "period_from" timestamp with time zone NOT NULL,
        "period_to" timestamp with time zone NOT NULL,
        "gross_sales_cop" integer NOT NULL,
        "commission_cop" integer NOT NULL,
        "net_payout_cop" integer NOT NULL,
        "payment_method" "payout_payment_method" NOT NULL,
        "reference_note" text,
        "performed_by_user_id" varchar NOT NULL,
        "paid_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "top_ups" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "idempotency_key" varchar(128),
        "bracelet_uid" varchar(64) NOT NULL,
        "amount_cop" integer NOT NULL,
        "payment_method" "payment_method" NOT NULL,
        "performed_by_user_id" varchar NOT NULL,
        "wompi_transaction_id" varchar,
        "status" "top_up_status" DEFAULT 'completed' NOT NULL,
        "new_balance_cop" integer NOT NULL,
        "new_counter" integer NOT NULL,
        "synced_at" timestamp with time zone,
        "offline_created_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "top_ups_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "transaction_line_items" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "transaction_log_id" varchar NOT NULL,
        "product_id" varchar,
        "product_name_snapshot" varchar(255) NOT NULL,
        "unit_price_snapshot" integer NOT NULL,
        "unit_cost_snapshot" integer DEFAULT 0 NOT NULL,
        "quantity" integer NOT NULL,
        "iva_amount_cop" integer DEFAULT 0 NOT NULL,
        "retencion_fuente_amount_cop" integer DEFAULT 0 NOT NULL,
        "retencion_ica_amount_cop" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "idempotency_key" varchar(128) NOT NULL,
        "bracelet_uid" varchar(64) NOT NULL,
        "location_id" varchar NOT NULL,
        "merchant_id" varchar NOT NULL,
        "event_id" varchar NOT NULL,
        "gross_amount_cop" integer NOT NULL,
        "commission_amount_cop" integer NOT NULL,
        "net_amount_cop" integer NOT NULL,
        "new_balance_cop" integer NOT NULL,
        "counter" integer NOT NULL,
        "performed_by_user_id" varchar,
        "synced_at" timestamp with time zone,
        "offline_created_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "transaction_logs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "promoter_companies" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_name" varchar(255) NOT NULL,
        "nit" varchar(50),
        "address" varchar(500),
        "phone" varchar(50),
        "email" varchar(255),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bracelet_uid" varchar(64) NOT NULL,
        "event_id" varchar NOT NULL,
        "amount_cop" integer NOT NULL,
        "refund_method" "refund_method" NOT NULL,
        "notes" text,
        "performed_by_user_id" varchar NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendee_refund_requests" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "attendee_user_id" varchar NOT NULL,
        "bracelet_uid" varchar(64) NOT NULL,
        "event_id" varchar NOT NULL,
        "amount_cop" integer NOT NULL,
        "refund_method" "attendee_refund_method" NOT NULL,
        "account_details" text,
        "notes" text,
        "status" "attendee_refund_request_status" DEFAULT 'pending' NOT NULL,
        "chip_zeroed" boolean DEFAULT false NOT NULL,
        "processed_by_user_id" varchar,
        "processed_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar NOT NULL,
        "type" "fraud_alert_type" NOT NULL,
        "severity" "fraud_alert_severity" NOT NULL,
        "entity_type" "fraud_alert_entity_type" NOT NULL,
        "entity_id" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "reported_by" varchar,
        "status" "fraud_alert_status" DEFAULT 'open' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wompi_payment_intents" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bracelet_uid" varchar(64) NOT NULL,
        "amount_cop" integer NOT NULL,
        "payment_method" "wompi_payment_method" NOT NULL,
        "phone_number" varchar(20),
        "bank_code" varchar(20),
        "wompi_transaction_id" varchar,
        "wompi_reference" varchar,
        "redirect_url" text,
        "status" "wompi_payment_status" DEFAULT 'pending' NOT NULL,
        "top_up_id" varchar,
        "performed_by_user_id" varchar,
        "self_service" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_upgrades" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bracelet_id" varchar NOT NULL,
        "zone_ids_added" text[] DEFAULT '{}'::text[] NOT NULL,
        "performed_by_user_id" varchar NOT NULL,
        "note" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_zones" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "color_hex" varchar(7),
        "rank" integer NOT NULL,
        "upgrade_price_cop" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_location_assignments" ADD CONSTRAINT "user_location_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_orders" ADD CONSTRAINT "restock_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_orders" ADD CONSTRAINT "restock_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_orders" ADD CONSTRAINT "restock_orders_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restock_order_id_restock_orders_id_fk" FOREIGN KEY ("restock_order_id") REFERENCES "public"."restock_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bracelets" ADD CONSTRAINT "bracelets_attendee_user_id_users_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payouts" ADD CONSTRAINT "merchant_payouts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payouts" ADD CONSTRAINT "merchant_payouts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payouts" ADD CONSTRAINT "merchant_payouts_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_transaction_log_id_transaction_logs_id_fk" FOREIGN KEY ("transaction_log_id") REFERENCES "public"."transaction_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_refund_requests" ADD CONSTRAINT "attendee_refund_requests_attendee_user_id_users_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_refund_requests" ADD CONSTRAINT "attendee_refund_requests_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wompi_payment_intents" ADD CONSTRAINT "wompi_payment_intents_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_upgrades" ADD CONSTRAINT "access_upgrades_bracelet_id_bracelets_id_fk" FOREIGN KEY ("bracelet_id") REFERENCES "public"."bracelets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_upgrades" ADD CONSTRAINT "access_upgrades_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_zones" ADD CONSTRAINT "access_zones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_events_promoter_company_id" ON "events" USING btree ("promoter_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_pending_refund_per_bracelet" ON "attendee_refund_requests" USING btree ("bracelet_uid") WHERE "attendee_refund_requests"."status" = 'pending';
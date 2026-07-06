-- V2.3 Vendor Multi-Outlet: schema + backfill

-- Stock transfer enum
CREATE TYPE "stock_transfer_status" AS ENUM ('pending', 'in_transit', 'completed', 'cancelled');

-- Orders: vendor fulfillment warehouse
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillment_outlet_id" UUID;

-- Warehouse ops
ALTER TABLE "picklists" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;

-- Per-outlet delivery config
ALTER TABLE "service_areas" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;
ALTER TABLE "delivery_slots" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;

-- Backfill inventory.outlet_id from vendor primary business account outlet
UPDATE "inventory" i
SET "outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE i.vendor_id = sub.vendor_id
  AND i.outlet_id IS NULL;

-- Fallback: first active outlet for vendor business account
UPDATE "inventory" i
SET "outlet_id" = sub.outlet_id
FROM (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, o.id AS outlet_id
  FROM "vendors" v
  JOIN "outlets" o ON o.business_account_id = v.business_account_id AND o.is_active = true
  ORDER BY v.id, o.created_at ASC
) sub
WHERE i.vendor_id = sub.vendor_id
  AND i.outlet_id IS NULL;

-- Inventory: drop product_id unique, require outlet_id, add composite unique
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_product_id_key";
ALTER TABLE "inventory" ALTER COLUMN "outlet_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_product_id_outlet_id_key"
  ON "inventory"("product_id", "outlet_id");

-- Backfill order fulfillment_outlet_id from vendor primary outlet
UPDATE "orders" o
SET "fulfillment_outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE o.vendor_id = sub.vendor_id
  AND o.fulfillment_outlet_id IS NULL;

UPDATE "orders" o
SET "fulfillment_outlet_id" = sub.outlet_id
FROM (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, ot.id AS outlet_id
  FROM "vendors" v
  JOIN "outlets" ot ON ot.business_account_id = v.business_account_id AND ot.is_active = true
  ORDER BY v.id, ot.created_at ASC
) sub
WHERE o.vendor_id = sub.vendor_id
  AND o.fulfillment_outlet_id IS NULL;

-- Backfill warehouse ops outlet_id
UPDATE "picklists" p
SET "outlet_id" = o.fulfillment_outlet_id
FROM "orders" o
WHERE p.order_id = o.id AND p.outlet_id IS NULL AND o.fulfillment_outlet_id IS NOT NULL;

UPDATE "dispatches" d
SET "outlet_id" = o.fulfillment_outlet_id
FROM "orders" o
WHERE d.order_id = o.id AND d.outlet_id IS NULL AND o.fulfillment_outlet_id IS NOT NULL;

UPDATE "picklists" p
SET "outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE p.vendor_id = sub.vendor_id AND p.outlet_id IS NULL;

UPDATE "dispatches" d
SET "outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE d.vendor_id = sub.vendor_id AND d.outlet_id IS NULL;

UPDATE "goods_receipts" g
SET "outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE g.vendor_id = sub.vendor_id AND g.outlet_id IS NULL;

-- Service areas: replace unique constraint
ALTER TABLE "service_areas" DROP CONSTRAINT IF EXISTS "service_areas_vendor_id_pincode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "service_areas_vendor_id_outlet_id_pincode_key"
  ON "service_areas"("vendor_id", "outlet_id", "pincode");

-- Delivery slots: replace unique constraint
ALTER TABLE "delivery_slots" DROP CONSTRAINT IF EXISTS "delivery_slots_vendor_id_day_of_week_slot_start_key";
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_slots_vendor_id_outlet_id_day_of_week_slot_start_key"
  ON "delivery_slots"("vendor_id", "outlet_id", "day_of_week", "slot_start");

-- FK constraints
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_outlet_id_fkey"
  FOREIGN KEY ("fulfillment_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "picklists" ADD CONSTRAINT "picklists_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_outlet_id_fkey";
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orders_fulfillment_outlet_id_idx" ON "orders"("fulfillment_outlet_id");
CREATE INDEX IF NOT EXISTS "picklists_outlet_id_idx" ON "picklists"("outlet_id");
CREATE INDEX IF NOT EXISTS "dispatches_outlet_id_idx" ON "dispatches"("outlet_id");
CREATE INDEX IF NOT EXISTS "goods_receipts_outlet_id_idx" ON "goods_receipts"("outlet_id");
CREATE INDEX IF NOT EXISTS "service_areas_outlet_id_idx" ON "service_areas"("outlet_id");
CREATE INDEX IF NOT EXISTS "delivery_slots_outlet_id_idx" ON "delivery_slots"("outlet_id");

-- Stock transfers
CREATE TABLE IF NOT EXISTS "stock_transfers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "from_outlet_id" UUID NOT NULL,
  "to_outlet_id" UUID NOT NULL,
  "status" "stock_transfer_status" NOT NULL DEFAULT 'pending',
  "items" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "created_by" UUID,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_outlet_id_fkey"
  FOREIGN KEY ("from_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_outlet_id_fkey"
  FOREIGN KEY ("to_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "stock_transfers_vendor_id_idx" ON "stock_transfers"("vendor_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_from_outlet_id_idx" ON "stock_transfers"("from_outlet_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_to_outlet_id_idx" ON "stock_transfers"("to_outlet_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_status_idx" ON "stock_transfers"("status");

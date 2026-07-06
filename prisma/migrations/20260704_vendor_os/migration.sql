-- Vendor OS migration: setup progress, multi-outlet inventory, customer payment modes, vendor claims
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "setup_progress" JSONB;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "multi_warehouse_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "auto_disable_oos" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "outlet_id" UUID;
CREATE INDEX IF NOT EXISTS "inventory_outlet_id_idx" ON "inventory"("outlet_id");
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_outlet_id_fkey";
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendor_customers" ADD COLUMN IF NOT EXISTS "allowed_payment_modes" TEXT[] NOT NULL DEFAULT ARRAY['cod','prepaid','credit','cheque'];

CREATE TYPE "vendor_claim_type" AS ENUM ('shortage', 'damage', 'quality', 'expiry');
CREATE TYPE "vendor_claim_status" AS ENUM ('pending', 'approved', 'rejected', 'resolved');

CREATE TABLE "vendor_claims" (
  "id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "type" "vendor_claim_type" NOT NULL,
  "status" "vendor_claim_status" NOT NULL DEFAULT 'pending',
  "amount" DECIMAL(12,2),
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vendor_claims_vendor_id_idx" ON "vendor_claims"("vendor_id");
CREATE INDEX "vendor_claims_order_id_idx" ON "vendor_claims"("order_id");
ALTER TABLE "vendor_claims" ADD CONSTRAINT "vendor_claims_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_claims" ADD CONSTRAINT "vendor_claims_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "picklist_status" AS ENUM ('draft', 'printed', 'picked', 'cancelled');
CREATE TYPE "dispatch_status" AS ENUM ('pending', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE "goods_receipt_status" AS ENUM ('draft', 'received', 'cancelled');

CREATE TABLE "picklists" (
  "id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "order_id" UUID,
  "status" "picklist_status" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "picklists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "picklists_vendor_id_idx" ON "picklists"("vendor_id");
CREATE INDEX "picklists_order_id_idx" ON "picklists"("order_id");
ALTER TABLE "picklists" ADD CONSTRAINT "picklists_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "picklists" ADD CONSTRAINT "picklists_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "dispatches" (
  "id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "order_id" UUID,
  "picklist_id" UUID,
  "status" "dispatch_status" NOT NULL DEFAULT 'pending',
  "driver_name" VARCHAR(100),
  "vehicle_number" VARCHAR(30),
  "dispatched_at" TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dispatches_vendor_id_idx" ON "dispatches"("vendor_id");
CREATE INDEX "dispatches_order_id_idx" ON "dispatches"("order_id");
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "reference_no" VARCHAR(50),
  "status" "goods_receipt_status" NOT NULL DEFAULT 'draft',
  "supplier" VARCHAR(150),
  "items" JSONB NOT NULL DEFAULT '[]',
  "received_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "goods_receipts_vendor_id_idx" ON "goods_receipts"("vendor_id");
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

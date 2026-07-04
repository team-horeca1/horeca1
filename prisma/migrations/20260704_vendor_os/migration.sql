-- Vendor OS migration: setup progress, multi-outlet inventory, customer payment modes, vendor claims
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "setup_progress" JSONB;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "multi_warehouse_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "auto_disable_oos" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "outlet_id" UUID REFERENCES "outlets"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "inventory_outlet_id_idx" ON "inventory"("outlet_id");

ALTER TABLE "vendor_customers" ADD COLUMN IF NOT EXISTS "allowed_payment_modes" TEXT[] NOT NULL DEFAULT ARRAY['cod','prepaid','credit','cheque'];

CREATE TYPE "vendor_claim_type" AS ENUM ('shortage', 'damage', 'quality', 'expiry');
CREATE TYPE "vendor_claim_status" AS ENUM ('pending', 'approved', 'rejected', 'resolved');

CREATE TABLE IF NOT EXISTS "vendor_claims" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "type" "vendor_claim_type" NOT NULL,
  "status" "vendor_claim_status" NOT NULL DEFAULT 'pending',
  "amount" DECIMAL(12,2),
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "vendor_claims_vendor_id_idx" ON "vendor_claims"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_claims_order_id_idx" ON "vendor_claims"("order_id");

CREATE TYPE "picklist_status" AS ENUM ('draft', 'printed', 'picked', 'cancelled');
CREATE TYPE "dispatch_status" AS ENUM ('pending', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE "goods_receipt_status" AS ENUM ('draft', 'received', 'cancelled');

CREATE TABLE IF NOT EXISTS "picklists" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "order_id" UUID REFERENCES "orders"("id") ON DELETE SET NULL,
  "status" "picklist_status" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "picklists_vendor_id_idx" ON "picklists"("vendor_id");

CREATE TABLE IF NOT EXISTS "dispatches" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "order_id" UUID REFERENCES "orders"("id") ON DELETE SET NULL,
  "picklist_id" UUID,
  "status" "dispatch_status" NOT NULL DEFAULT 'pending',
  "driver_name" VARCHAR(100),
  "vehicle_number" VARCHAR(30),
  "dispatched_at" TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "dispatches_vendor_id_idx" ON "dispatches"("vendor_id");

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "reference_no" VARCHAR(50),
  "status" "goods_receipt_status" NOT NULL DEFAULT 'draft',
  "supplier" VARCHAR(150),
  "items" JSONB NOT NULL DEFAULT '[]',
  "received_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "goods_receipts_vendor_id_idx" ON "goods_receipts"("vendor_id");

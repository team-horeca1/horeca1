-- Supplier Payables Phase 1. Finance batches are separate from vendor_settlements.

CREATE TYPE "vendor_settlement_cycle" AS ENUM ('manual', 'weekly');
CREATE TYPE "supplier_payable_status" AS ENUM (
  'pending_capture',
  'awaiting_completion',
  'commission_unconfigured',
  'eligible',
  'on_hold',
  'in_batch',
  'settled',
  'closed'
);
CREATE TYPE "finance_batch_status" AS ENUM ('draft', 'in_review', 'finalised', 'settled', 'cancelled');
CREATE TYPE "settlement_claim_owner" AS ENUM ('finance', 'legacy_wallet');

ALTER TABLE "vendors" ADD COLUMN "settlement_cycle" "vendor_settlement_cycle" NOT NULL DEFAULT 'manual';

CREATE TABLE "supplier_commission_agreements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "rate_pct" DECIMAL(5,2) NOT NULL,
  "effective_from" TIMESTAMPTZ NOT NULL,
  "effective_to" TIMESTAMPTZ,
  "reason" TEXT NOT NULL,
  "actor_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_commission_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_settlement_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_number" VARCHAR(40) NOT NULL,
  "vendor_id" UUID NOT NULL,
  "status" "finance_batch_status" NOT NULL DEFAULT 'draft',
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "commercial_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "held_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "order_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID NOT NULL,
  "finalised_by_id" UUID,
  "settled_by_id" UUID,
  "settled_at" TIMESTAMPTZ,
  "bank_reference" VARCHAR(100),
  "cancelled_by_id" UUID,
  "cancelled_at" TIMESTAMPTZ,
  "cancel_reason" TEXT,
  "idempotency_key" VARCHAR(80),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_settlement_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payable_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "status" "supplier_payable_status" NOT NULL DEFAULT 'pending_capture',
  "commercial_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "collected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "recognised_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commission_rate_pct" DECIMAL(5,2),
  "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_payable" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "provisional_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "blocked_sale" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "above_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "rate_snapshotted_at" TIMESTAMPTZ,
  "finance_batch_id" UUID,
  "breakdown" JSONB NOT NULL DEFAULT '{}',
  "calculated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payable_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payable_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "line_id" UUID,
  "order_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "event_type" VARCHAR(40) NOT NULL,
  "source_type" VARCHAR(40) NOT NULL,
  "source_id" VARCHAR(80) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "actor_id" UUID,
  "approval_status" VARCHAR(20),
  "applied_batch_id" UUID,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payable_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payable_holds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "line_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "opened_by_id" UUID NOT NULL,
  "released_by_id" UUID,
  "released_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payable_holds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_settlement_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "actor_id" UUID,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_settlement_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_settlement_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "owner" "settlement_claim_owner" NOT NULL,
  "finance_batch_id" UUID,
  "legacy_settlement_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ,
  CONSTRAINT "supplier_settlement_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_settlement_batches_batch_number_key" ON "finance_settlement_batches"("batch_number");
CREATE UNIQUE INDEX "finance_settlement_batches_idempotency_key_key" ON "finance_settlement_batches"("idempotency_key");
CREATE UNIQUE INDEX "supplier_payable_lines_order_id_key" ON "supplier_payable_lines"("order_id");
CREATE UNIQUE INDEX "supplier_payable_events_source_type_source_id_key" ON "supplier_payable_events"("source_type", "source_id");
CREATE UNIQUE INDEX "supplier_settlement_claims_one_active" ON "supplier_settlement_claims"("order_id") WHERE "released_at" IS NULL;

CREATE INDEX "supplier_commission_agreements_vendor_id_effective_from_idx" ON "supplier_commission_agreements"("vendor_id", "effective_from");
CREATE INDEX "supplier_payable_lines_vendor_id_status_idx" ON "supplier_payable_lines"("vendor_id", "status");
CREATE INDEX "supplier_payable_lines_finance_batch_id_idx" ON "supplier_payable_lines"("finance_batch_id");
CREATE INDEX "supplier_payable_events_order_id_idx" ON "supplier_payable_events"("order_id");
CREATE INDEX "supplier_payable_events_vendor_id_event_type_idx" ON "supplier_payable_events"("vendor_id", "event_type");
CREATE INDEX "supplier_payable_events_applied_batch_id_idx" ON "supplier_payable_events"("applied_batch_id");
CREATE INDEX "supplier_payable_holds_line_id_idx" ON "supplier_payable_holds"("line_id");
CREATE INDEX "finance_settlement_batches_vendor_id_status_idx" ON "finance_settlement_batches"("vendor_id", "status");
CREATE INDEX "finance_settlement_batches_settled_at_idx" ON "finance_settlement_batches"("settled_at");
CREATE INDEX "finance_settlement_events_batch_id_created_at_idx" ON "finance_settlement_events"("batch_id", "created_at");
CREATE INDEX "supplier_settlement_claims_order_id_idx" ON "supplier_settlement_claims"("order_id");
CREATE INDEX "supplier_settlement_claims_finance_batch_id_idx" ON "supplier_settlement_claims"("finance_batch_id");

ALTER TABLE "supplier_commission_agreements" ADD CONSTRAINT "supplier_commission_agreements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_settlement_batches" ADD CONSTRAINT "finance_settlement_batches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_lines" ADD CONSTRAINT "supplier_payable_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_lines" ADD CONSTRAINT "supplier_payable_lines_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_lines" ADD CONSTRAINT "supplier_payable_lines_finance_batch_id_fkey" FOREIGN KEY ("finance_batch_id") REFERENCES "finance_settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_events" ADD CONSTRAINT "supplier_payable_events_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "supplier_payable_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_events" ADD CONSTRAINT "supplier_payable_events_applied_batch_id_fkey" FOREIGN KEY ("applied_batch_id") REFERENCES "finance_settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_payable_holds" ADD CONSTRAINT "supplier_payable_holds_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "supplier_payable_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_settlement_events" ADD CONSTRAINT "finance_settlement_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "finance_settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_settlement_claims" ADD CONSTRAINT "supplier_settlement_claims_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_settlement_claims" ADD CONSTRAINT "supplier_settlement_claims_finance_batch_id_fkey" FOREIGN KEY ("finance_batch_id") REFERENCES "finance_settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing explicit supplier rates become open agreements. Null rates stay unconfigured.
INSERT INTO "supplier_commission_agreements" ("vendor_id", "rate_pct", "effective_from", "reason")
SELECT "id", "platform_fee_pct", "created_at", 'Backfilled from the supplier rate already stored on the vendor'
FROM "vendors"
WHERE "platform_fee_pct" IS NOT NULL;

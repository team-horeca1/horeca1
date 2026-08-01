-- S9 Returns Workspace v2: multi-return per order, item lines, events,
-- inspection + disposition enums. Migrate legacy statuses to S9 lifecycle.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "return_item_reason" AS ENUM (
    'damaged',
    'expired',
    'wrong_item',
    'short_supplied',
    'quality_issue',
    'not_as_described',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "return_item_decision" AS ENUM (
    'pending',
    'approved',
    'partial',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "return_disposition" AS ENUM (
    'saleable',
    'return_to_brand',
    'damaged',
    'expired',
    'scrap',
    'qa_hold'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Evolve return_requests ───────────────────────────────────────────────────

-- Allow multiple returns per order (unique was a constraint, not a plain index)
ALTER TABLE "return_requests" DROP CONSTRAINT IF EXISTS "return_requests_order_id_key";
DROP INDEX IF EXISTS "return_requests_order_id_key";

ALTER TABLE "return_requests"
  ALTER COLUMN "status" TYPE VARCHAR(40),
  ALTER COLUMN "status" SET DEFAULT 'new';

ALTER TABLE "return_requests"
  ADD COLUMN IF NOT EXISTS "invoice_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "type" VARCHAR(20) NOT NULL DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS "pickup_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickup_address" TEXT,
  ADD COLUMN IF NOT EXISTS "pickup_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "goods_received_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "replacement_order_id" UUID;

-- Legacy → S9 status mapping (see LEGACY_RETURN_STATUS_MAP)
UPDATE "return_requests" SET "status" = 'new' WHERE "status" = 'pending';
UPDATE "return_requests" SET "status" = 'approved' WHERE "status" = 'refund_processing';
UPDATE "return_requests" SET "status" = 'closed' WHERE "status" IN ('refunded', 'resolved');
-- approved / rejected already valid S9 values

-- Backfill invoice_number from order number where missing
UPDATE "return_requests" rr
SET "invoice_number" = o."order_number"
FROM "orders" o
WHERE rr."order_id" = o."id"
  AND rr."invoice_number" IS NULL;

CREATE INDEX IF NOT EXISTS "return_requests_order_id_idx"
  ON "return_requests"("order_id");
CREATE INDEX IF NOT EXISTS "return_requests_customer_id_idx"
  ON "return_requests"("customer_id");
CREATE INDEX IF NOT EXISTS "return_requests_type_idx"
  ON "return_requests"("type");
CREATE INDEX IF NOT EXISTS "return_requests_replacement_order_id_idx"
  ON "return_requests"("replacement_order_id");
CREATE INDEX IF NOT EXISTS "return_requests_created_at_idx"
  ON "return_requests"("created_at" DESC);

DO $$ BEGIN
  ALTER TABLE "return_requests"
    ADD CONSTRAINT "return_requests_replacement_order_id_fkey"
    FOREIGN KEY ("replacement_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Return line items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "return_items" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "requested_qty" INTEGER NOT NULL,
    "approved_qty" INTEGER,
    "reason" "return_item_reason" NOT NULL,
    "decision" "return_item_decision" NOT NULL DEFAULT 'pending',
    "disposition" "return_disposition",
    "note" TEXT,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "return_items_return_request_id_order_item_id_key"
  ON "return_items"("return_request_id", "order_item_id");
CREATE INDEX IF NOT EXISTS "return_items_return_request_id_idx"
  ON "return_items"("return_request_id");
CREATE INDEX IF NOT EXISTS "return_items_order_item_id_idx"
  ON "return_items"("order_item_id");

DO $$ BEGIN
  ALTER TABLE "return_items"
    ADD CONSTRAINT "return_items_return_request_id_fkey"
    FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "return_items"
    ADD CONSTRAINT "return_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Return events (append-only) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "return_events" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "from_status" VARCHAR(40),
    "to_status" VARCHAR(40),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "return_events_return_request_id_created_at_idx"
  ON "return_events"("return_request_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "return_events_actor_id_idx"
  ON "return_events"("actor_id");

DO $$ BEGIN
  ALTER TABLE "return_events"
    ADD CONSTRAINT "return_events_return_request_id_fkey"
    FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "return_events"
    ADD CONSTRAINT "return_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Return inspection (1:1 with return request) ──────────────────────────────

CREATE TABLE IF NOT EXISTS "return_inspections" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "notes" TEXT,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_inspections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "return_inspections_return_request_id_key"
  ON "return_inspections"("return_request_id");
CREATE INDEX IF NOT EXISTS "return_inspections_verified_by_idx"
  ON "return_inspections"("verified_by");

DO $$ BEGIN
  ALTER TABLE "return_inspections"
    ADD CONSTRAINT "return_inspections_return_request_id_fkey"
    FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "return_inspections"
    ADD CONSTRAINT "return_inspections_verified_by_fkey"
    FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

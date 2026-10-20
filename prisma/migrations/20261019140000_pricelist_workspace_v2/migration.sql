-- Pricing workspace V2: exclusions, credit_status assignments, publish history,
-- optional list floor, order-line price snapshots.

-- PriceList: optional floor percent of base
ALTER TABLE "price_lists"
  ADD COLUMN IF NOT EXISTS "floor_percent_of_base" DECIMAL(5, 2);

-- PriceListItem: remove-from-list (Hidden wins)
ALTER TABLE "price_list_items"
  ADD COLUMN IF NOT EXISTS "is_excluded" BOOLEAN NOT NULL DEFAULT false;

-- Assignment type: credit_status
ALTER TYPE "price_list_assignment_type" ADD VALUE IF NOT EXISTS 'credit_status';

ALTER TABLE "price_list_assignments"
  ADD COLUMN IF NOT EXISTS "credit_status" VARCHAR(32);

CREATE INDEX IF NOT EXISTS "price_list_assignments_credit_status_idx"
  ON "price_list_assignments"("credit_status");

-- NOTE: backfill using 'credit_status' lives in the next migration
-- (20261019140100). Postgres forbids using a newly added enum value
-- in the same transaction that adds it, and Prisma wraps each
-- migration in a transaction — so ADD VALUE must commit first.

-- Publish kind enum + append-only publish table
DO $$ BEGIN
  CREATE TYPE "price_list_publish_kind" AS ENUM ('publish', 'rollback');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "price_list_publishes" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" "price_list_publish_kind" NOT NULL DEFAULT 'publish',
    "base_version_id" UUID,
    "rollback_of_id" UUID,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "changes" JSONB NOT NULL DEFAULT '[]',
    "cell_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_publishes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "price_list_publishes_vendor_id_created_at_idx"
  ON "price_list_publishes"("vendor_id", "created_at" DESC);

ALTER TABLE "price_list_publishes"
  DROP CONSTRAINT IF EXISTS "price_list_publishes_vendor_id_fkey";
ALTER TABLE "price_list_publishes"
  ADD CONSTRAINT "price_list_publishes_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_list_publishes"
  DROP CONSTRAINT IF EXISTS "price_list_publishes_actor_id_fkey";
ALTER TABLE "price_list_publishes"
  ADD CONSTRAINT "price_list_publishes_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrderItem price resolution snapshot (no FK — lists may be deleted)
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "price_list_id" UUID;
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "price_list_item_id" UUID;
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "price_source" VARCHAR(64);

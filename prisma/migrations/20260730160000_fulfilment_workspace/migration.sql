-- S8 Fulfilment Workspace: Fulfilment aggregate + delivery roster/events;
-- extend Picklist/Dispatch with fulfilment + failed_delivery links.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "fulfilment_status" AS ENUM (
    'awaiting_picking',
    'picking',
    'awaiting_packing',
    'packed',
    'ready_for_dispatch',
    'out_for_delivery',
    'delivered',
    'failed_delivery'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "delivery_resource_type" AS ENUM (
    'executive',
    'vehicle',
    'logistics_partner'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "dispatch_status" ADD VALUE IF NOT EXISTS 'failed_delivery';

-- ── Delivery resources (roster) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "delivery_resources" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "type" "delivery_resource_type" NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "delivery_resources_vendor_id_idx"
  ON "delivery_resources"("vendor_id");
CREATE INDEX IF NOT EXISTS "delivery_resources_vendor_id_is_active_idx"
  ON "delivery_resources"("vendor_id", "is_active");

DO $$ BEGIN
  ALTER TABLE "delivery_resources"
    ADD CONSTRAINT "delivery_resources_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Fulfilments (1:1 with orders once accepted) ──────────────────────────────

CREATE TABLE IF NOT EXISTS "fulfilments" (
    "id" UUID NOT NULL,
    "fulfilment_number" VARCHAR(50) NOT NULL,
    "order_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "status" "fulfilment_status" NOT NULL DEFAULT 'awaiting_picking',
    "delivery_resource_id" UUID,
    "eta" TIMESTAMPTZ,
    "failed_reason" TEXT,
    "redelivery_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fulfilments_fulfilment_number_key"
  ON "fulfilments"("fulfilment_number");
CREATE UNIQUE INDEX IF NOT EXISTS "fulfilments_order_id_key"
  ON "fulfilments"("order_id");
CREATE INDEX IF NOT EXISTS "fulfilments_vendor_id_idx"
  ON "fulfilments"("vendor_id");
CREATE INDEX IF NOT EXISTS "fulfilments_outlet_id_idx"
  ON "fulfilments"("outlet_id");
CREATE INDEX IF NOT EXISTS "fulfilments_status_idx"
  ON "fulfilments"("status");
CREATE INDEX IF NOT EXISTS "fulfilments_delivery_resource_id_idx"
  ON "fulfilments"("delivery_resource_id");
CREATE INDEX IF NOT EXISTS "fulfilments_created_at_idx"
  ON "fulfilments"("created_at" DESC);

DO $$ BEGIN
  ALTER TABLE "fulfilments"
    ADD CONSTRAINT "fulfilments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fulfilments"
    ADD CONSTRAINT "fulfilments_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fulfilments"
    ADD CONSTRAINT "fulfilments_outlet_id_fkey"
    FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fulfilments"
    ADD CONSTRAINT "fulfilments_delivery_resource_id_fkey"
    FOREIGN KEY ("delivery_resource_id") REFERENCES "delivery_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Fulfilment line items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "fulfilment_items" (
    "id" UUID NOT NULL,
    "fulfilment_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "accepted_qty" INTEGER NOT NULL,
    "picked_qty" INTEGER NOT NULL DEFAULT 0,
    "packed_qty" INTEGER NOT NULL DEFAULT 0,
    "exception_note" TEXT,

    CONSTRAINT "fulfilment_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fulfilment_items_fulfilment_id_order_item_id_key"
  ON "fulfilment_items"("fulfilment_id", "order_item_id");
CREATE INDEX IF NOT EXISTS "fulfilment_items_fulfilment_id_idx"
  ON "fulfilment_items"("fulfilment_id");
CREATE INDEX IF NOT EXISTS "fulfilment_items_order_item_id_idx"
  ON "fulfilment_items"("order_item_id");

DO $$ BEGIN
  ALTER TABLE "fulfilment_items"
    ADD CONSTRAINT "fulfilment_items_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fulfilment_items"
    ADD CONSTRAINT "fulfilment_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Fulfilment events (append-only) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "fulfilment_events" (
    "id" UUID NOT NULL,
    "fulfilment_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "from_status" VARCHAR(40),
    "to_status" VARCHAR(40),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fulfilment_events_fulfilment_id_created_at_idx"
  ON "fulfilment_events"("fulfilment_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "fulfilment_events_actor_id_idx"
  ON "fulfilment_events"("actor_id");

DO $$ BEGIN
  ALTER TABLE "fulfilment_events"
    ADD CONSTRAINT "fulfilment_events_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fulfilment_events"
    ADD CONSTRAINT "fulfilment_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Delivery events (append-only journey) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "delivery_events" (
    "id" UUID NOT NULL,
    "fulfilment_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" VARCHAR(40) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "delivery_events_fulfilment_id_created_at_idx"
  ON "delivery_events"("fulfilment_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "delivery_events_actor_id_idx"
  ON "delivery_events"("actor_id");

DO $$ BEGIN
  ALTER TABLE "delivery_events"
    ADD CONSTRAINT "delivery_events_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_events"
    ADD CONSTRAINT "delivery_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Extend Picklist / Dispatch ───────────────────────────────────────────────

ALTER TABLE "picklists"
  ADD COLUMN IF NOT EXISTS "fulfilment_id" UUID;

CREATE INDEX IF NOT EXISTS "picklists_fulfilment_id_idx"
  ON "picklists"("fulfilment_id");

DO $$ BEGIN
  ALTER TABLE "picklists"
    ADD CONSTRAINT "picklists_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "dispatches"
  ADD COLUMN IF NOT EXISTS "fulfilment_id" UUID;
ALTER TABLE "dispatches"
  ADD COLUMN IF NOT EXISTS "delivery_resource_id" UUID;

CREATE INDEX IF NOT EXISTS "dispatches_fulfilment_id_idx"
  ON "dispatches"("fulfilment_id");
CREATE INDEX IF NOT EXISTS "dispatches_delivery_resource_id_idx"
  ON "dispatches"("delivery_resource_id");

DO $$ BEGIN
  ALTER TABLE "dispatches"
    ADD CONSTRAINT "dispatches_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "dispatches"
    ADD CONSTRAINT "dispatches_delivery_resource_id_fkey"
    FOREIGN KEY ("delivery_resource_id") REFERENCES "delivery_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

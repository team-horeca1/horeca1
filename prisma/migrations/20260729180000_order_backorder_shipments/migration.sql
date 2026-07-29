-- Partial fulfillment / backorder: cancelled qty + shipment audit trail

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "cancelled_qty" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "order_shipments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "shipment_no" INTEGER NOT NULL,
  "actor_id" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "order_shipment_items" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "qty" INTEGER NOT NULL,
  CONSTRAINT "order_shipment_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_shipments_order_id_shipment_no_key"
  ON "order_shipments"("order_id", "shipment_no");

CREATE INDEX IF NOT EXISTS "order_shipments_order_id_created_at_idx"
  ON "order_shipments"("order_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "order_shipment_items_shipment_id_idx"
  ON "order_shipment_items"("shipment_id");

CREATE INDEX IF NOT EXISTS "order_shipment_items_order_item_id_idx"
  ON "order_shipment_items"("order_item_id");

DO $$ BEGIN
  ALTER TABLE "order_shipments"
    ADD CONSTRAINT "order_shipments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_shipments"
    ADD CONSTRAINT "order_shipments_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_shipment_items"
    ADD CONSTRAINT "order_shipment_items_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "order_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_shipment_items"
    ADD CONSTRAINT "order_shipment_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

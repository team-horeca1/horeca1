-- Section 4: dedicated price change history (default + pricelist prices)

CREATE TABLE IF NOT EXISTS "price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_list_id" UUID,
    "field" VARCHAR(64) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "source" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(200),
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "price_history_product_id_created_at_idx"
  ON "price_history"("product_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "price_history_vendor_id_created_at_idx"
  ON "price_history"("vendor_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "price_history_price_list_id_created_at_idx"
  ON "price_history"("price_list_id", "created_at" DESC);

ALTER TABLE "price_history"
  ADD CONSTRAINT "price_history_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_history"
  ADD CONSTRAINT "price_history_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_history"
  ADD CONSTRAINT "price_history_price_list_id_fkey"
  FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "price_history"
  ADD CONSTRAINT "price_history_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

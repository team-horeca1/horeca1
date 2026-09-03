-- Fair curated collections: attach Horeca1 MasterProducts instead of vendor SKUs.
CREATE TABLE IF NOT EXISTS "collection_master_products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "collection_id" UUID NOT NULL,
  "master_product_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "collection_master_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "collection_master_products_collection_id_master_product_id_key"
  ON "collection_master_products"("collection_id", "master_product_id");

CREATE INDEX IF NOT EXISTS "collection_master_products_master_product_id_idx"
  ON "collection_master_products"("master_product_id");

DO $$ BEGIN
  ALTER TABLE "collection_master_products"
    ADD CONSTRAINT "collection_master_products_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "collection_master_products"
    ADD CONSTRAINT "collection_master_products_master_product_id_fkey"
    FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill from legacy collection_products where the listing has a master.
INSERT INTO "collection_master_products" ("id", "collection_id", "master_product_id", "sort_order")
SELECT gen_random_uuid(), cp.collection_id, p.master_product_id, MIN(cp.sort_order)
FROM collection_products cp
INNER JOIN products p ON p.id = cp.product_id
WHERE p.master_product_id IS NOT NULL
GROUP BY cp.collection_id, p.master_product_id
ON CONFLICT ("collection_id", "master_product_id") DO NOTHING;

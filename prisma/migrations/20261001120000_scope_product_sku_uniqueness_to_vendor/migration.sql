-- Drop the rogue global unique index on products(lower(sku)) that blocked
-- multi-store/outlet vendors and cross-vendor imports with identical SKUs.
DROP INDEX IF EXISTS "products_sku_unique_ci";

-- Ensure SKU uniqueness is scoped per vendor/store (vendor_id):
CREATE UNIQUE INDEX IF NOT EXISTS "products_vendor_id_sku_unique_ci"
ON "products" ("vendor_id", lower("sku"))
WHERE "sku" IS NOT NULL AND "sku" <> '' AND "slug" NOT LIKE '_deleted_%';

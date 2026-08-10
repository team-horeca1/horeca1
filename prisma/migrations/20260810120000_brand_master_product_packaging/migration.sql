-- Shipping package dimensions for BrandMasterProduct.
-- Distinct from net_weight / net_weight_unit (product contents vs carton/shipping).

ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "package_weight" DECIMAL(10,3);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "weight_unit" VARCHAR(20);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "package_length" DECIMAL(10,3);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "package_width" DECIMAL(10,3);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "package_height" DECIMAL(10,3);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "dimension_unit" VARCHAR(20);

-- BrandMasterProduct product-detail columns (identity, specs, packaging, search).
-- Commercial fields (price, tax, inventory) stay on supplier Product.

ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "hsn" VARCHAR(50);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "barcode" VARCHAR(100);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "ean" VARCHAR(50);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "veg_non_veg" "veg_type";
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "storage_type" VARCHAR(50);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "shelf_life_days" INTEGER;
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "country_of_origin" VARCHAR(100);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "fssai_ref" VARCHAR(50);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "net_weight" DECIMAL(10,3);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "net_weight_unit" VARCHAR(20);
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "brand_master_products" ADD COLUMN IF NOT EXISTS "alias_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

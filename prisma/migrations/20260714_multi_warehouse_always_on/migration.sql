-- Multi-warehouse always on for all vendors (platform policy).
UPDATE "vendors" SET "multi_warehouse_enabled" = true WHERE "multi_warehouse_enabled" = false;
ALTER TABLE "vendors" ALTER COLUMN "multi_warehouse_enabled" SET DEFAULT true;

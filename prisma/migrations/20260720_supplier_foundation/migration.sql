-- Supplier Foundation: N Online Stores (vendors) per Business; store-scoped roles;
-- retire multi-warehouse (Online Store = stock location).

-- 1. Drop 1:1 unique on vendors.business_account_id
DROP INDEX IF EXISTS "vendors_business_account_id_key";
CREATE INDEX IF NOT EXISTS "vendors_business_account_id_idx" ON "vendors"("business_account_id");

-- 2. Online Store display fields + default outlet
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255);
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "is_primary_store" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "default_outlet_id" UUID;

-- Backfill display_name + mark every existing vendor as primary store of its BA
UPDATE "vendors"
SET "display_name" = COALESCE("display_name", "business_name"),
    "is_primary_store" = true
WHERE "display_name" IS NULL OR "is_primary_store" = false;

-- 3. Set default_outlet_id from BA primary outlet (or earliest outlet on BA)
UPDATE "vendors" v
SET "default_outlet_id" = COALESCE(
  (SELECT ba."primary_outlet_id" FROM "business_accounts" ba WHERE ba."id" = v."business_account_id"),
  (SELECT o."id" FROM "outlets" o
   WHERE o."business_account_id" = v."business_account_id" AND o."is_active" = true
   ORDER BY o."created_at" ASC LIMIT 1)
)
WHERE v."default_outlet_id" IS NULL;

ALTER TABLE "vendors"
  DROP CONSTRAINT IF EXISTS "vendors_default_outlet_id_fkey";
ALTER TABLE "vendors"
  ADD CONSTRAINT "vendors_default_outlet_id_fkey"
  FOREIGN KEY ("default_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "vendors_default_outlet_id_key" ON "vendors"("default_outlet_id");

-- 4. UserRole.vendor_id for Online Store scope
ALTER TABLE "user_roles" ADD COLUMN IF NOT EXISTS "vendor_id" UUID;

ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_business_account_id_outlet_id_role_id_key";
DROP INDEX IF EXISTS "user_roles_user_id_business_account_id_outlet_id_role_id_key";
-- Match Prisma @@unique([userId, businessAccountId, outletId, vendorId, roleId])
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_id_business_account_id_outlet_id_vendor_id_role_id_key"
  ON "user_roles"("user_id", "business_account_id", "outlet_id", "vendor_id", "role_id");

ALTER TABLE "user_roles"
  DROP CONSTRAINT IF EXISTS "user_roles_vendor_id_fkey";
ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "user_roles_vendor_id_idx" ON "user_roles"("vendor_id");

-- 5. Disable multi-warehouse (Online Store is the stock unit)
UPDATE "vendors" SET "multi_warehouse_enabled" = false;
ALTER TABLE "vendors" ALTER COLUMN "multi_warehouse_enabled" SET DEFAULT false;

-- 6. Merge multi-outlet inventory onto each vendor's default outlet (sum qtys)
-- 6a. Aggregate extras into the default-outlet row when one already exists
UPDATE "inventory" dest
SET
  "qty_available" = dest."qty_available" + src.sum_avail,
  "qty_reserved" = dest."qty_reserved" + src.sum_reserved,
  "qty_in_transit" = dest."qty_in_transit" + src.sum_transit,
  "qty_damaged" = dest."qty_damaged" + src.sum_damaged,
  "qty_returned" = dest."qty_returned" + src.sum_returned,
  "updated_at" = NOW()
FROM (
  SELECT
    i."product_id",
    i."vendor_id",
    v."default_outlet_id" AS target_outlet,
    SUM(i."qty_available") AS sum_avail,
    SUM(i."qty_reserved") AS sum_reserved,
    SUM(i."qty_in_transit") AS sum_transit,
    SUM(i."qty_damaged") AS sum_damaged,
    SUM(i."qty_returned") AS sum_returned
  FROM "inventory" i
  JOIN "vendors" v ON v."id" = i."vendor_id"
  WHERE v."default_outlet_id" IS NOT NULL
    AND i."outlet_id" <> v."default_outlet_id"
  GROUP BY i."product_id", i."vendor_id", v."default_outlet_id"
) src
WHERE dest."product_id" = src."product_id"
  AND dest."vendor_id" = src."vendor_id"
  AND dest."outlet_id" = src.target_outlet;

-- 6b. Move rows that have no destination row yet onto the default outlet
UPDATE "inventory" i
SET "outlet_id" = v."default_outlet_id",
    "updated_at" = NOW()
FROM "vendors" v
WHERE i."vendor_id" = v."id"
  AND v."default_outlet_id" IS NOT NULL
  AND i."outlet_id" <> v."default_outlet_id"
  AND NOT EXISTS (
    SELECT 1 FROM "inventory" d
    WHERE d."product_id" = i."product_id"
      AND d."outlet_id" = v."default_outlet_id"
  );

-- 6c. Delete leftover non-default inventory rows (already merged in 6a)
DELETE FROM "inventory" i
USING "vendors" v
WHERE i."vendor_id" = v."id"
  AND v."default_outlet_id" IS NOT NULL
  AND i."outlet_id" <> v."default_outlet_id";

-- 7. Collapse service areas onto default outlet (dedupe pincodes first)
DELETE FROM "service_areas" sa
USING "vendors" v, "service_areas" keep
WHERE sa."vendor_id" = v."id"
  AND v."default_outlet_id" IS NOT NULL
  AND sa."outlet_id" IS DISTINCT FROM v."default_outlet_id"
  AND keep."vendor_id" = sa."vendor_id"
  AND keep."pincode" = sa."pincode"
  AND keep."outlet_id" IS NOT DISTINCT FROM v."default_outlet_id";

UPDATE "service_areas" sa
SET "outlet_id" = v."default_outlet_id"
FROM "vendors" v
WHERE sa."vendor_id" = v."id"
  AND v."default_outlet_id" IS NOT NULL
  AND sa."outlet_id" IS DISTINCT FROM v."default_outlet_id";

UPDATE "delivery_slots" ds
SET "outlet_id" = v."default_outlet_id"
FROM "vendors" v
WHERE ds."vendor_id" = v."id"
  AND v."default_outlet_id" IS NOT NULL
  AND ds."outlet_id" IS DISTINCT FROM v."default_outlet_id";

-- 8. Go-live backfill for already live stores
UPDATE "vendors"
SET "setup_progress" = COALESCE("setup_progress", '{}'::jsonb) || '{"go_live": true, "business": true, "online_store": true}'::jsonb
WHERE "is_verified" = true AND "is_active" = true;

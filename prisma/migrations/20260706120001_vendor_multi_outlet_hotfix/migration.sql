-- Hotfix: migration dropped CONSTRAINT but unique INDEX inventory_product_id_key can remain in Postgres.
DROP INDEX IF EXISTS "inventory_product_id_key";

-- Re-run order fulfillment backfill for any rows missed (vendors without primary_outlet_id at migrate time).
UPDATE "orders" o
SET "fulfillment_outlet_id" = sub.primary_outlet_id
FROM (
  SELECT v.id AS vendor_id, ba.primary_outlet_id
  FROM "vendors" v
  JOIN "business_accounts" ba ON ba.id = v.business_account_id
  WHERE ba.primary_outlet_id IS NOT NULL
) sub
WHERE o.vendor_id = sub.vendor_id
  AND o.fulfillment_outlet_id IS NULL;

UPDATE "orders" o
SET "fulfillment_outlet_id" = sub.outlet_id
FROM (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, ot.id AS outlet_id
  FROM "vendors" v
  JOIN "outlets" ot ON ot.business_account_id = v.business_account_id AND ot.is_active = true
  ORDER BY v.id, ot.created_at ASC
) sub
WHERE o.vendor_id = sub.vendor_id
  AND o.fulfillment_outlet_id IS NULL;

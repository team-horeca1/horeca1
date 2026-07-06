-- CI drift fix: 0_init created these as UNIQUE INDEXes, not table CONSTRAINTs.
-- 20260706120000 used DROP CONSTRAINT which is a no-op in Postgres; the old
-- single-column uniques must be removed so outlet-scoped uniques match schema.prisma.
DROP INDEX IF EXISTS "inventory_product_id_key";
DROP INDEX IF EXISTS "service_areas_vendor_id_pincode_key";
DROP INDEX IF EXISTS "delivery_slots_vendor_id_day_of_week_slot_start_key";

-- Align collection_master_products.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side (no DB default). The hand-written
-- 20260903120000 migration used DEFAULT gen_random_uuid(), which caused
-- CI schema drift in migration consistency checks.

ALTER TABLE "collection_master_products" ALTER COLUMN "id" DROP DEFAULT;

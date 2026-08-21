-- Align vendor_credit_configs.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side (no DB default). The hand-written
-- 20260821120000 migration used DEFAULT gen_random_uuid(), which caused
-- CI schema drift (same class of issue as 20260630090000 / 20260727190000).

ALTER TABLE "vendor_credit_configs" ALTER COLUMN "id" DROP DEFAULT;

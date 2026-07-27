-- Align price_history.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side (no DB default). The hand-written
-- 20260727180000 migration used DEFAULT gen_random_uuid(), which caused
-- CI schema drift (same class of issue as 20260630090000 for audit logs).

ALTER TABLE "price_history" ALTER COLUMN "id" DROP DEFAULT;

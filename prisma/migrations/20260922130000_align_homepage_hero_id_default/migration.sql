-- Align homepage_heroes.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side (no DB default). The hand-written
-- 20260922120000 migration used DEFAULT gen_random_uuid(), which caused
-- CI schema drift in migration consistency checks.

ALTER TABLE "homepage_heroes" ALTER COLUMN "id" DROP DEFAULT;

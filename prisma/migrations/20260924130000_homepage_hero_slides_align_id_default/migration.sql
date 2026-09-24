-- Align homepage_hero_slides.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side (no DB default). The hand-written
-- create migration used DEFAULT gen_random_uuid(), which causes CI schema drift.

ALTER TABLE "homepage_hero_slides" ALTER COLUMN "id" DROP DEFAULT;

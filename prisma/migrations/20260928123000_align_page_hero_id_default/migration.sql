-- Prisma generates UUIDs client-side for @default(uuid()).
-- The hand-written create used DEFAULT gen_random_uuid(), which fails CI drift.

ALTER TABLE "page_hero_slides" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "homepage_heroes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "desktop_image_url" VARCHAR(1024),
    "mobile_image_url" VARCHAR(1024),
    "eyebrow" VARCHAR(255) NOT NULL DEFAULT 'India''s Hospitality Supply Network',
    "headline" VARCHAR(500) NOT NULL DEFAULT 'Everything your restaurant needs. In one place.',
    "cta_label" VARCHAR(120) NOT NULL DEFAULT 'Start exploring',
    "cta_href" VARCHAR(500) NOT NULL DEFAULT '/category',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homepage_heroes_pkey" PRIMARY KEY ("id")
);

-- Seed the single CMS row (null images → storefront static fallbacks)
INSERT INTO "homepage_heroes" ("id") VALUES (gen_random_uuid());

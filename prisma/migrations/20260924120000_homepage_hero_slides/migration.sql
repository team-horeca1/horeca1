-- Multi-slide homepage hero: create slides table, copy legacy single-row CMS, drop old table.

CREATE TABLE "homepage_hero_slides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "desktop_image_url" VARCHAR(1024),
    "mobile_image_url" VARCHAR(1024),
    "eyebrow" VARCHAR(255) NOT NULL DEFAULT 'India''s Hospitality Supply Network',
    "headline" VARCHAR(500) NOT NULL DEFAULT 'Everything your restaurant needs. In one place.',
    "cta_label" VARCHAR(120) NOT NULL DEFAULT 'Start exploring',
    "cta_href" VARCHAR(500) NOT NULL DEFAULT '/category',
    "show_text" BOOLEAN NOT NULL DEFAULT true,
    "show_cta" BOOLEAN NOT NULL DEFAULT true,
    "copy_align_x" VARCHAR(16) NOT NULL DEFAULT 'left',
    "copy_align_y" VARCHAR(16) NOT NULL DEFAULT 'bottom',
    "copy_offset_x" INTEGER NOT NULL DEFAULT 0,
    "copy_offset_y" INTEGER NOT NULL DEFAULT 0,
    "show_text_mobile" BOOLEAN NOT NULL DEFAULT true,
    "show_cta_mobile" BOOLEAN NOT NULL DEFAULT true,
    "copy_align_x_mobile" VARCHAR(16) NOT NULL DEFAULT 'left',
    "copy_align_y_mobile" VARCHAR(16) NOT NULL DEFAULT 'bottom',
    "copy_offset_x_mobile" INTEGER NOT NULL DEFAULT 0,
    "copy_offset_y_mobile" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homepage_hero_slides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "homepage_hero_slides_is_active_sort_order_idx"
  ON "homepage_hero_slides"("is_active", "sort_order");

-- Migrate existing single-row hero (if any) into the first slide.
INSERT INTO "homepage_hero_slides" (
    "id",
    "desktop_image_url",
    "mobile_image_url",
    "eyebrow",
    "headline",
    "cta_label",
    "cta_href",
    "show_text",
    "show_cta",
    "copy_align_x",
    "copy_align_y",
    "copy_offset_x",
    "copy_offset_y",
    "show_text_mobile",
    "show_cta_mobile",
    "copy_align_x_mobile",
    "copy_align_y_mobile",
    "copy_offset_x_mobile",
    "copy_offset_y_mobile",
    "sort_order",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "desktop_image_url",
    "mobile_image_url",
    "eyebrow",
    "headline",
    "cta_label",
    "cta_href",
    "show_text",
    "show_cta",
    "copy_align_x",
    "copy_align_y",
    "copy_offset_x",
    "copy_offset_y",
    "show_text_mobile",
    "show_cta_mobile",
    "copy_align_x_mobile",
    "copy_align_y_mobile",
    "copy_offset_x_mobile",
    "copy_offset_y_mobile",
    0,
    true,
    "created_at",
    "updated_at"
FROM "homepage_heroes";

-- If legacy table was empty, seed one active slide with defaults.
INSERT INTO "homepage_hero_slides" ("id", "sort_order", "is_active")
SELECT gen_random_uuid(), 0, true
WHERE NOT EXISTS (SELECT 1 FROM "homepage_hero_slides");

DROP TABLE "homepage_heroes";

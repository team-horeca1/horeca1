-- Store and brand page hero slides. Homepage slides stay on homepage_hero_slides.

CREATE TABLE "page_hero_slides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID,
    "brand_id" UUID,
    "desktop_image_url" VARCHAR(1024),
    "mobile_image_url" VARCHAR(1024),
    "eyebrow" VARCHAR(255) NOT NULL DEFAULT '',
    "headline" VARCHAR(500) NOT NULL DEFAULT '',
    "cta_label" VARCHAR(120) NOT NULL DEFAULT '',
    "cta_href" VARCHAR(500) NOT NULL DEFAULT '',
    "show_text" BOOLEAN NOT NULL DEFAULT false,
    "show_cta" BOOLEAN NOT NULL DEFAULT false,
    "copy_align_x" VARCHAR(16) NOT NULL DEFAULT 'left',
    "copy_align_y" VARCHAR(16) NOT NULL DEFAULT 'bottom',
    "copy_offset_x" INTEGER NOT NULL DEFAULT 0,
    "copy_offset_y" INTEGER NOT NULL DEFAULT 0,
    "show_text_mobile" BOOLEAN NOT NULL DEFAULT false,
    "show_cta_mobile" BOOLEAN NOT NULL DEFAULT false,
    "copy_align_x_mobile" VARCHAR(16) NOT NULL DEFAULT 'left',
    "copy_align_y_mobile" VARCHAR(16) NOT NULL DEFAULT 'bottom',
    "copy_offset_x_mobile" INTEGER NOT NULL DEFAULT 0,
    "copy_offset_y_mobile" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_hero_slides_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "page_hero_slides"
ADD CONSTRAINT "page_hero_slides_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_hero_slides"
ADD CONSTRAINT "page_hero_slides_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_hero_slides"
ADD CONSTRAINT "page_hero_slides_one_owner_chk"
CHECK (
    ("vendor_id" IS NOT NULL AND "brand_id" IS NULL)
    OR ("vendor_id" IS NULL AND "brand_id" IS NOT NULL)
);

CREATE INDEX "page_hero_slides_vendor_id_is_active_sort_order_idx"
ON "page_hero_slides"("vendor_id", "is_active", "sort_order");

CREATE INDEX "page_hero_slides_brand_id_is_active_sort_order_idx"
ON "page_hero_slides"("brand_id", "is_active", "sort_order");

-- Keep existing brand headers as the first photo-only slide.
INSERT INTO "page_hero_slides" (
    "id",
    "brand_id",
    "desktop_image_url",
    "eyebrow",
    "headline",
    "cta_label",
    "cta_href",
    "show_text",
    "show_cta",
    "show_text_mobile",
    "show_cta_mobile",
    "sort_order",
    "is_active"
)
SELECT
    gen_random_uuid(),
    b."id",
    b."banner_url",
    '',
    '',
    '',
    '',
    false,
    false,
    false,
    false,
    0,
    true
FROM "brands" b
WHERE b."banner_url" IS NOT NULL
  AND b."banner_url" <> ''
  AND NOT EXISTS (
      SELECT 1 FROM "page_hero_slides" s WHERE s."brand_id" = b."id"
  );

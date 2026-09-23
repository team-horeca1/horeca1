-- Per-device hero text/CTA visibility, placement, and nudge offsets.
-- Seed mobile columns from existing desktop values so live banners do not jump.

ALTER TABLE "homepage_heroes"
  ADD COLUMN "copy_offset_x" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "copy_offset_y" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "show_text_mobile" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_cta_mobile" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "copy_align_x_mobile" VARCHAR(16) NOT NULL DEFAULT 'left',
  ADD COLUMN "copy_align_y_mobile" VARCHAR(16) NOT NULL DEFAULT 'bottom',
  ADD COLUMN "copy_offset_x_mobile" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "copy_offset_y_mobile" INTEGER NOT NULL DEFAULT 0;

UPDATE "homepage_heroes"
SET
  "show_text_mobile" = "show_text",
  "show_cta_mobile" = "show_cta",
  "copy_align_x_mobile" = "copy_align_x",
  "copy_align_y_mobile" = "copy_align_y";

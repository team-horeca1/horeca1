-- Homepage hero: hide text and button independently, and place the copy on the photo.

ALTER TABLE "homepage_heroes"
  ADD COLUMN "show_text" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_cta" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "copy_align_x" VARCHAR(16) NOT NULL DEFAULT 'left',
  ADD COLUMN "copy_align_y" VARCHAR(16) NOT NULL DEFAULT 'bottom';

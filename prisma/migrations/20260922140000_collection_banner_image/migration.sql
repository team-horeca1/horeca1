-- Separate detail-page banner from homepage/grid card image.
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "banner_image_url" VARCHAR(512);

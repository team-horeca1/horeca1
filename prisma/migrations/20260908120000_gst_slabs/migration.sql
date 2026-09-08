-- GST slab options for product Tax % dropdowns (admin-editable).
ALTER TABLE "platform_settings"
ADD COLUMN "gst_slabs" INTEGER[] NOT NULL DEFAULT ARRAY[0, 5, 12, 18, 28]::INTEGER[];

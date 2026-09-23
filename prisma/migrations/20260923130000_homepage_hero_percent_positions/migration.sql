-- Reinterpret copy_offset_* as 0–100% positions from the banner top-left
-- (studio.aneeverse-style text-on-image). Seed from the previous align so
-- existing banners land near the same corner.

UPDATE "homepage_heroes"
SET
  "copy_offset_x" = CASE "copy_align_x"
    WHEN 'center' THEN 50
    WHEN 'right' THEN 72
    ELSE 4
  END,
  "copy_offset_y" = CASE "copy_align_y"
    WHEN 'top' THEN 10
    WHEN 'center' THEN 40
    ELSE 58
  END,
  "copy_offset_x_mobile" = CASE "copy_align_x_mobile"
    WHEN 'center' THEN 50
    WHEN 'right' THEN 72
    ELSE 4
  END,
  "copy_offset_y_mobile" = CASE "copy_align_y_mobile"
    WHEN 'top' THEN 10
    WHEN 'center' THEN 40
    ELSE 58
  END;

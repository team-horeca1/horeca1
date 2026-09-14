-- Keep stored platform copy on Horeca1 (not the retired "HoReCa Hub" name).
ALTER TABLE "platform_settings" ALTER COLUMN "platform_name" SET DEFAULT 'Horeca1';

UPDATE "platform_settings"
SET
  "platform_name" = 'Horeca1',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "platform_name" ~* 'horeca\s*hub'
   OR "platform_name" IN ('HoReCa1', 'HoReCa Hub', 'Horeca Hub');

UPDATE "notifications"
SET
  "title" = CASE
    WHEN "title" IS NULL THEN NULL
    ELSE regexp_replace("title", 'HoReCa Hub|Horeca Hub|HORECA HUB|horeca hub', 'Horeca1', 'gi')
  END,
  "body" = CASE
    WHEN "body" IS NULL THEN NULL
    ELSE regexp_replace("body", 'HoReCa Hub|Horeca Hub|HORECA HUB|horeca hub', 'Horeca1', 'gi')
  END
WHERE COALESCE("title", '') ~* 'horeca\s*hub'
   OR COALESCE("body", '') ~* 'horeca\s*hub';

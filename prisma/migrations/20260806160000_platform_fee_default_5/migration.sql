-- Update global platform fee default from 10% to 5%
ALTER TABLE "platform_settings" ALTER COLUMN "default_commission_pct" SET DEFAULT 5;

UPDATE "platform_settings" SET "default_commission_pct" = 5
WHERE "default_commission_pct" = 10;

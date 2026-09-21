-- Delivery Plan: Vendor toggles, ServiceArea schedule, PlatformHoliday,
-- PlatformSetting defaults, Order.deliveryMode.

CREATE TYPE "delivery_mode" AS ENUM ('supplier_delivery', 'third_party', 'self_pickup');
CREATE TYPE "holiday_scope" AS ENUM ('all_india');

-- Vendor-level Delivery Plan toggles
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "self_pickup_offered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deliver_through_public_holidays" BOOLEAN NOT NULL DEFAULT false;

-- ServiceArea Delivery Plan schedule fields
ALTER TABLE "service_areas"
  ADD COLUMN IF NOT EXISTS "city_label" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "area_label" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "delivers_mon" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "delivers_tue" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivers_wed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "delivers_thu" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivers_fri" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "delivers_sat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delivers_sun" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cutoff_time" VARCHAR(10) NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS "third_party_delivery_available" BOOLEAN NOT NULL DEFAULT false;

-- PlatformSetting Delivery Plan defaults (Mon/Wed/Fri @ 16:00)
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "default_delivers_mon" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "default_delivers_tue" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "default_delivers_wed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "default_delivers_thu" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "default_delivers_fri" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "default_delivers_sat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "default_delivers_sun" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "default_cutoff_time" VARCHAR(10) NOT NULL DEFAULT '16:00';

-- Order delivery mode (nullable for legacy rows)
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_mode" "delivery_mode";

-- Admin-fed holiday calendar
-- NOTE: id has NO DB default — schema uses @default(uuid()) (Prisma client-side).
-- A DEFAULT gen_random_uuid() here fails CI migrate-diff drift checks.
CREATE TABLE IF NOT EXISTS "platform_holidays" (
  "id" UUID NOT NULL,
  "holiday_date" DATE NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "scope" "holiday_scope" NOT NULL DEFAULT 'all_india',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_holidays_holiday_date_scope_key"
  ON "platform_holidays"("holiday_date", "scope");

CREATE INDEX IF NOT EXISTS "platform_holidays_holiday_date_idx"
  ON "platform_holidays"("holiday_date");

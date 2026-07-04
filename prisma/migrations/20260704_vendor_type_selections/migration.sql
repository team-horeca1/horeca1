-- Add multi-select vendor type storage (Vendor + BusinessAccount)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "vendor_type_selections" JSONB;
ALTER TABLE "business_accounts" ADD COLUMN IF NOT EXISTS "vendor_type_selections" JSONB;

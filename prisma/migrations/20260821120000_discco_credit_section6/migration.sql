-- DiSCCO Section 6: creditSource, expanded statuses, reservation, vendor defaults

-- AlterEnum: CreditWalletStatus
ALTER TYPE "credit_wallet_status" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "credit_wallet_status" ADD VALUE IF NOT EXISTS 'FROZEN';
ALTER TYPE "credit_wallet_status" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "credit_wallet_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- CreateEnum: CreditSource
DO $$ BEGIN
  CREATE TYPE "credit_source" AS ENUM ('SUPPLIER_CREDIT', 'HORECA1_CREDIT', 'NBFC_CREDIT', 'BANK_CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum: CreditWalletTxnType
ALTER TYPE "credit_wallet_txn_type" ADD VALUE IF NOT EXISTS 'DELIVERY_CONVERT';

-- AlterTable: CreditWallet new columns
ALTER TABLE "credit_wallets"
  ADD COLUMN IF NOT EXISTS "credit_source" "credit_source" NOT NULL DEFAULT 'SUPPLIER_CREDIT',
  ADD COLUMN IF NOT EXISTS "reserved_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMPTZ;

-- Backfill creditSource from vendorId presence
UPDATE "credit_wallets"
SET "credit_source" = CASE
  WHEN "vendor_id" IS NULL THEN 'HORECA1_CREDIT'::"credit_source"
  ELSE 'SUPPLIER_CREDIT'::"credit_source"
END;

-- CreateTable: VendorCreditConfig
CREATE TABLE IF NOT EXISTS "vendor_credit_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "repayment_mode" "credit_repayment_mode",
  "billing_model" "billing_model_type",
  "default_credit_limit" DECIMAL(12,2),
  "credit_tenure_days" INTEGER,
  "grace_period_days" INTEGER,
  "blacklist_days" INTEGER,
  "interest_rate_pct" DECIMAL(6,3),
  "interest_frequency_days" INTEGER,
  "penalty_amount" DECIMAL(12,2),
  "penalty_frequency_days" INTEGER,
  "credit_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_credit_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_credit_configs_vendor_id_key" ON "vendor_credit_configs"("vendor_id");

DO $$ BEGIN
  ALTER TABLE "vendor_credit_configs"
    ADD CONSTRAINT "vendor_credit_configs_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "credit_wallets_credit_source_idx" ON "credit_wallets"("credit_source");
CREATE INDEX IF NOT EXISTS "credit_wallets_valid_until_idx" ON "credit_wallets"("valid_until");

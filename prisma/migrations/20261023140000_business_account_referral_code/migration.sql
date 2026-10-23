-- Optional Earnchilada affiliate code on the shared registration record.
-- Existing business_accounts rows keep referral_code NULL.
ALTER TABLE "business_accounts" ADD COLUMN "referral_code" VARCHAR(12);

CREATE INDEX "business_accounts_referral_code_idx" ON "business_accounts"("referral_code");

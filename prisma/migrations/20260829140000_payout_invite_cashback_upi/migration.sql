-- Cashback UPI: optional reference + public message, vendor-scoped links, no required expiry.

ALTER TABLE "payout_invites" ADD COLUMN "reference_number" VARCHAR(80);
ALTER TABLE "payout_invites" ADD COLUMN "claimed_business_name" VARCHAR(255);
ALTER TABLE "payout_invites" ADD COLUMN "vendor_id" UUID;
ALTER TABLE "payout_invites" ALTER COLUMN "expires_at" DROP NOT NULL;

ALTER TABLE "payout_invites"
  ADD CONSTRAINT "payout_invites_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payout_invites_vendor_id_idx" ON "payout_invites"("vendor_id");
CREATE INDEX "payout_invites_reference_number_idx" ON "payout_invites"("reference_number");

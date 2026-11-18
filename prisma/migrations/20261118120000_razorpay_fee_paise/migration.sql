-- Real Razorpay fee in paise. Null means Razorpay did not return a fee.
ALTER TABLE "payments" ADD COLUMN "razorpay_fee_paise" INTEGER;
ALTER TABLE "payments" ADD COLUMN "razorpay_tax_paise" INTEGER;

ALTER TYPE "supplier_payable_status" ADD VALUE IF NOT EXISTS 'fee_unknown';

ALTER TABLE "supplier_payable_lines" ADD COLUMN "razorpay_fee" DECIMAL(12,2);
ALTER TABLE "supplier_payable_lines" ADD COLUMN "razorpay_fee_unknown" BOOLEAN NOT NULL DEFAULT false;

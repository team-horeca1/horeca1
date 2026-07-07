-- Vendor Finance OS: platform fee per vendor + order settlement snapshots + wallet txn breakdown

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "platform_fee_pct" DECIMAL(5,2);

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_gross_amount" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_platform_fee_pct" DECIMAL(5,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_platform_fee" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_gateway_fee" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_net_vendor_amount" DECIMAL(12,2);

ALTER TABLE "vendor_wallet_txns" ADD COLUMN IF NOT EXISTS "gross_amount" DECIMAL(12,2);
ALTER TABLE "vendor_wallet_txns" ADD COLUMN IF NOT EXISTS "platform_fee" DECIMAL(12,2);
ALTER TABLE "vendor_wallet_txns" ADD COLUMN IF NOT EXISTS "gateway_fee" DECIMAL(12,2);
ALTER TABLE "vendor_wallet_txns" ADD COLUMN IF NOT EXISTS "net_amount" DECIMAL(12,2);

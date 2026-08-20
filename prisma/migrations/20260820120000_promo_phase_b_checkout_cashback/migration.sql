-- Promo Engine Phase B: checkout-level cashback, wallet stacking flags.

ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "stacks_with_wallet" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "cashback_campaigns" ADD COLUMN IF NOT EXISTS "stacks_with_wallet" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "cashback_entries" ADD COLUMN IF NOT EXISTS "checkout_group_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "cashback_entries_checkout_group_id_key" ON "cashback_entries"("checkout_group_id");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checkout_group_id" UUID;
CREATE INDEX IF NOT EXISTS "orders_checkout_group_id_idx" ON "orders"("checkout_group_id");

-- Freeze buyer + supplier invoice identity on the order at checkout.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "billing_snapshot" JSONB;

-- Abandoned cart: payment closed or failed, stock already released, order not cancelled.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "abandoned_at" TIMESTAMPTZ;

-- Older checkouts marked these as cancelled. Put them back as abandoned carts
-- so sales can call, and a later payment can complete the same order.
UPDATE "orders"
SET
  status = 'pending',
  abandoned_at = COALESCE(rejected_at, updated_at),
  rejected_at = NULL
WHERE status = 'cancelled'
  AND payment_status = 'unpaid'
  AND payment_method = 'online'
  AND (
    rejection_reason ILIKE 'Payment cancelled%'
    OR rejection_reason ILIKE 'Payment failed%'
  );

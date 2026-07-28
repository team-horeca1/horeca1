-- Section 7 Flow 18: customer cancellation requests

CREATE TABLE IF NOT EXISTS "cancel_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "vendor_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancel_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cancel_requests_order_id_key" ON "cancel_requests"("order_id");
CREATE INDEX IF NOT EXISTS "cancel_requests_status_idx" ON "cancel_requests"("status");
CREATE INDEX IF NOT EXISTS "cancel_requests_customer_id_idx" ON "cancel_requests"("customer_id");

ALTER TABLE "cancel_requests"
  ADD CONSTRAINT "cancel_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cancel_requests"
  ADD CONSTRAINT "cancel_requests_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

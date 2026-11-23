CREATE TABLE IF NOT EXISTS "ledger_order_flags" (
  "order_id" UUID NOT NULL,
  "flag" VARCHAR(60) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_order_flags_pkey" PRIMARY KEY ("order_id")
);

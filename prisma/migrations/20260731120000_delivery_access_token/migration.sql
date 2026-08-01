-- Magic-link POD tokens for delivery boys (public /d/[token]).

CREATE TABLE IF NOT EXISTS "delivery_access_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "order_id" UUID NOT NULL,
    "fulfilment_id" UUID NOT NULL,
    "delivery_boy_name" VARCHAR(150) NOT NULL,
    "delivery_boy_phone" VARCHAR(20) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_access_tokens_token_key"
  ON "delivery_access_tokens"("token");

CREATE INDEX IF NOT EXISTS "delivery_access_tokens_order_id_idx"
  ON "delivery_access_tokens"("order_id");

CREATE INDEX IF NOT EXISTS "delivery_access_tokens_fulfilment_id_idx"
  ON "delivery_access_tokens"("fulfilment_id");

CREATE INDEX IF NOT EXISTS "delivery_access_tokens_fulfilment_id_revoked_at_idx"
  ON "delivery_access_tokens"("fulfilment_id", "revoked_at");

CREATE INDEX IF NOT EXISTS "delivery_access_tokens_expires_at_idx"
  ON "delivery_access_tokens"("expires_at");

DO $$ BEGIN
  ALTER TABLE "delivery_access_tokens"
    ADD CONSTRAINT "delivery_access_tokens_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_access_tokens"
    ADD CONSTRAINT "delivery_access_tokens_fulfilment_id_fkey"
    FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

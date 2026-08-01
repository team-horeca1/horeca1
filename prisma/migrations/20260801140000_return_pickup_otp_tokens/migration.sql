-- S9 returns alignment: pickup OTP + skip-pickup audit, magic-link tokens,
-- and extended ReturnItemReason values (excess / customer rejected).

-- ── Enum extensions ──────────────────────────────────────────────────────────

ALTER TYPE "return_item_reason" ADD VALUE IF NOT EXISTS 'excess_supplied';
ALTER TYPE "return_item_reason" ADD VALUE IF NOT EXISTS 'customer_rejected';

-- ── ReturnRequest pickup OTP + skip audit ────────────────────────────────────

ALTER TABLE "return_requests"
  ADD COLUMN IF NOT EXISTS "pickup_otp" VARCHAR(6),
  ADD COLUMN IF NOT EXISTS "pickup_otp_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickup_otp_verified_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickup_skipped_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickup_skip_reason" TEXT;

-- ── Return pickup magic-link tokens (/r/[token]) ─────────────────────────────

CREATE TABLE IF NOT EXISTS "return_pickup_access_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "return_request_id" UUID NOT NULL,
    "delivery_boy_name" VARCHAR(150),
    "delivery_boy_phone" VARCHAR(20),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_pickup_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "return_pickup_access_tokens_token_key"
  ON "return_pickup_access_tokens"("token");

CREATE INDEX IF NOT EXISTS "return_pickup_access_tokens_return_request_id_idx"
  ON "return_pickup_access_tokens"("return_request_id");

CREATE INDEX IF NOT EXISTS "return_pickup_access_tokens_return_request_id_revoked_at_idx"
  ON "return_pickup_access_tokens"("return_request_id", "revoked_at");

CREATE INDEX IF NOT EXISTS "return_pickup_access_tokens_expires_at_idx"
  ON "return_pickup_access_tokens"("expires_at");

DO $$ BEGIN
  ALTER TABLE "return_pickup_access_tokens"
    ADD CONSTRAINT "return_pickup_access_tokens_return_request_id_fkey"
    FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

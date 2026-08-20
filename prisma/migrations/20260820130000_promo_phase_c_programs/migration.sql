-- Promo Engine Phase C: Welcome / First Order / Referral / PayoutInvite,
-- coupon audience targeting, and cashback entry sources.

-- ── Enum extensions ──────────────────────────────────────────────────────────

ALTER TYPE "cashback_entry_source" ADD VALUE IF NOT EXISTS 'welcome';
ALTER TYPE "cashback_entry_source" ADD VALUE IF NOT EXISTS 'first_order';
ALTER TYPE "cashback_entry_source" ADD VALUE IF NOT EXISTS 'referral';
ALTER TYPE "cashback_entry_source" ADD VALUE IF NOT EXISTS 'payout_invite';

DO $$ BEGIN
  CREATE TYPE "program_reward_type" AS ENUM (
    'wallet_credit',
    'coupon_flat',
    'coupon_percentage',
    'cashback',
    'free_delivery'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "referral_trigger" AS ENUM (
    'signup',
    'first_order',
    'first_order_mov'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "referral_reward_side" AS ENUM (
    'referrer',
    'referred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "payout_invite_status" AS ENUM (
    'pending',
    'claimed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Coupon audience + user referral token ────────────────────────────────────

ALTER TABLE "coupons"
  ADD COLUMN IF NOT EXISTS "audience_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referral_token" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_token_key"
  ON "users"("referral_token");

-- ── Welcome Offer (singleton) + grants ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "welcome_offers" (
    "id" UUID NOT NULL,
    "singleton_key" VARCHAR(20) NOT NULL DEFAULT 'default',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "reward_type" "program_reward_type" NOT NULL,
    "reward_value" DECIMAL(10, 2) NOT NULL,
    "min_order_value" DECIMAL(12, 2),
    "valid_days" INTEGER,
    "max_discount" DECIMAL(10, 2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "welcome_offers_singleton_key_key"
  ON "welcome_offers"("singleton_key");

CREATE TABLE IF NOT EXISTS "welcome_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "reward_type" "program_reward_type" NOT NULL,
    "reward_value" DECIMAL(10, 2) NOT NULL,
    "coupon_id" UUID,
    "cashback_entry_id" UUID,
    "wallet_txn_id" UUID,
    "consumed_at" TIMESTAMPTZ,
    "consumed_order_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "welcome_grants_user_id_key"
  ON "welcome_grants"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "welcome_grants_cashback_entry_id_key"
  ON "welcome_grants"("cashback_entry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "welcome_grants_wallet_txn_id_key"
  ON "welcome_grants"("wallet_txn_id");
CREATE INDEX IF NOT EXISTS "welcome_grants_offer_id_idx"
  ON "welcome_grants"("offer_id");

-- ── First Order Offer (singleton) + grants ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "first_order_offers" (
    "id" UUID NOT NULL,
    "singleton_key" VARCHAR(20) NOT NULL DEFAULT 'default',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "reward_type" "program_reward_type" NOT NULL,
    "reward_value" DECIMAL(10, 2) NOT NULL,
    "min_order_value" DECIMAL(12, 2),
    "valid_days" INTEGER,
    "max_discount" DECIMAL(10, 2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "first_order_offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "first_order_offers_singleton_key_key"
  ON "first_order_offers"("singleton_key");

CREATE TABLE IF NOT EXISTS "first_order_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "order_id" UUID,
    "checkout_group_id" UUID,
    "reward_type" "program_reward_type" NOT NULL,
    "reward_value" DECIMAL(10, 2) NOT NULL,
    "coupon_id" UUID,
    "cashback_entry_id" UUID,
    "wallet_txn_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "first_order_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "first_order_grants_user_id_key"
  ON "first_order_grants"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "first_order_grants_order_id_key"
  ON "first_order_grants"("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "first_order_grants_cashback_entry_id_key"
  ON "first_order_grants"("cashback_entry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "first_order_grants_wallet_txn_id_key"
  ON "first_order_grants"("wallet_txn_id");
CREATE INDEX IF NOT EXISTS "first_order_grants_offer_id_idx"
  ON "first_order_grants"("offer_id");
CREATE INDEX IF NOT EXISTS "first_order_grants_checkout_group_id_idx"
  ON "first_order_grants"("checkout_group_id");

-- ── Referral program + clicks + attribution + rewards ────────────────────────

CREATE TABLE IF NOT EXISTS "referral_programs" (
    "id" UUID NOT NULL,
    "singleton_key" VARCHAR(20) NOT NULL DEFAULT 'default',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "trigger" "referral_trigger" NOT NULL DEFAULT 'signup',
    "min_order_value" DECIMAL(12, 2),
    "referrer_reward_type" "program_reward_type" NOT NULL,
    "referrer_reward_value" DECIMAL(10, 2) NOT NULL,
    "referrer_max_discount" DECIMAL(10, 2),
    "referrer_valid_days" INTEGER,
    "referred_reward_type" "program_reward_type" NOT NULL,
    "referred_reward_value" DECIMAL(10, 2) NOT NULL,
    "referred_max_discount" DECIMAL(10, 2),
    "referred_valid_days" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_programs_singleton_key_key"
  ON "referral_programs"("singleton_key");

CREATE TABLE IF NOT EXISTS "referral_clicks" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "referrer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "referral_clicks_token_created_at_idx"
  ON "referral_clicks"("token", "created_at");
CREATE INDEX IF NOT EXISTS "referral_clicks_referrer_id_idx"
  ON "referral_clicks"("referrer_id");

CREATE TABLE IF NOT EXISTS "referral_attributions" (
    "id" UUID NOT NULL,
    "referred_user_id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "click_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_referred_user_id_key"
  ON "referral_attributions"("referred_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_click_id_key"
  ON "referral_attributions"("click_id");
CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_id_idx"
  ON "referral_attributions"("referrer_id");

CREATE TABLE IF NOT EXISTS "referral_rewards" (
    "id" UUID NOT NULL,
    "attribution_id" UUID NOT NULL,
    "side" "referral_reward_side" NOT NULL,
    "reward_type" "program_reward_type" NOT NULL,
    "reward_value" DECIMAL(10, 2) NOT NULL,
    "coupon_id" UUID,
    "cashback_entry_id" UUID,
    "wallet_txn_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_rewards_attribution_id_side_key"
  ON "referral_rewards"("attribution_id", "side");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_rewards_cashback_entry_id_key"
  ON "referral_rewards"("cashback_entry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_rewards_wallet_txn_id_key"
  ON "referral_rewards"("wallet_txn_id");

-- ── Payout magic-link invites ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payout_invites" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "notes" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_id" UUID,
    "created_by_id" UUID NOT NULL,
    "status" "payout_invite_status" NOT NULL DEFAULT 'pending',
    "claimed_at" TIMESTAMPTZ,
    "claimed_name" VARCHAR(255),
    "claimed_upi_id" VARCHAR(100),
    "cashback_entry_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payout_invites_token_key"
  ON "payout_invites"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "payout_invites_cashback_entry_id_key"
  ON "payout_invites"("cashback_entry_id");
CREATE INDEX IF NOT EXISTS "payout_invites_status_expires_at_idx"
  ON "payout_invites"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "payout_invites_created_by_id_idx"
  ON "payout_invites"("created_by_id");
CREATE INDEX IF NOT EXISTS "payout_invites_user_id_idx"
  ON "payout_invites"("user_id");

-- ── Foreign keys ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "welcome_grants"
    ADD CONSTRAINT "welcome_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcome_grants"
    ADD CONSTRAINT "welcome_grants_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "welcome_offers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcome_grants"
    ADD CONSTRAINT "welcome_grants_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcome_grants"
    ADD CONSTRAINT "welcome_grants_cashback_entry_id_fkey"
    FOREIGN KEY ("cashback_entry_id") REFERENCES "cashback_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "first_order_grants"
    ADD CONSTRAINT "first_order_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "first_order_grants"
    ADD CONSTRAINT "first_order_grants_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "first_order_offers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "first_order_grants"
    ADD CONSTRAINT "first_order_grants_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "first_order_grants"
    ADD CONSTRAINT "first_order_grants_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "first_order_grants"
    ADD CONSTRAINT "first_order_grants_cashback_entry_id_fkey"
    FOREIGN KEY ("cashback_entry_id") REFERENCES "cashback_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_clicks"
    ADD CONSTRAINT "referral_clicks_referrer_id_fkey"
    FOREIGN KEY ("referrer_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_attributions"
    ADD CONSTRAINT "referral_attributions_referred_user_id_fkey"
    FOREIGN KEY ("referred_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_attributions"
    ADD CONSTRAINT "referral_attributions_referrer_id_fkey"
    FOREIGN KEY ("referrer_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_attributions"
    ADD CONSTRAINT "referral_attributions_click_id_fkey"
    FOREIGN KEY ("click_id") REFERENCES "referral_clicks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_rewards"
    ADD CONSTRAINT "referral_rewards_attribution_id_fkey"
    FOREIGN KEY ("attribution_id") REFERENCES "referral_attributions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_rewards"
    ADD CONSTRAINT "referral_rewards_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "referral_rewards"
    ADD CONSTRAINT "referral_rewards_cashback_entry_id_fkey"
    FOREIGN KEY ("cashback_entry_id") REFERENCES "cashback_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_invites"
    ADD CONSTRAINT "payout_invites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_invites"
    ADD CONSTRAINT "payout_invites_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_invites"
    ADD CONSTRAINT "payout_invites_cashback_entry_id_fkey"
    FOREIGN KEY ("cashback_entry_id") REFERENCES "cashback_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

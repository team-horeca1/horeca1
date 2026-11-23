-- Append-only shadow journal. Existing money tables are not changed
-- except optional source columns on wallet_transactions.

ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "funder_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "funder_id" UUID;

-- Enforce non-negative wallet balance for new writes. Existing rows are not scanned.
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_balance_nonnegative";
ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balance_nonnegative" CHECK ("balance" >= 0) NOT VALID;

CREATE TABLE "ledger_accounts" (
  "id" UUID NOT NULL,
  "code" VARCHAR(180) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "owner_type" VARCHAR(30),
  "owner_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");
CREATE INDEX "ledger_accounts_owner_idx" ON "ledger_accounts"("owner_type", "owner_id");

CREATE TABLE "journal_entries" (
  "id" UUID NOT NULL,
  "event_type" VARCHAR(60) NOT NULL,
  "event_ref_type" VARCHAR(40) NOT NULL,
  "event_ref_id" VARCHAR(80) NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_by" VARCHAR(80),
  "approved_by" VARCHAR(80),
  "reason_code" VARCHAR(60),
  "remarks" TEXT,
  "reverses_entry_id" UUID,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "journal_entries_idempotency_key_key" ON "journal_entries"("idempotency_key");
CREATE INDEX "journal_entries_ref_idx" ON "journal_entries"("event_ref_type", "event_ref_id");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approver_differs"
  CHECK (
    "event_type" NOT IN ('writeoff', 'manual_adjustment', 'reversal', 'batch_approve')
    OR ("approved_by" IS NOT NULL AND "approved_by" <> "posted_by")
  );

CREATE TABLE "journal_lines" (
  "id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "debit_paise" INTEGER NOT NULL DEFAULT 0,
  "credit_paise" INTEGER NOT NULL DEFAULT 0,
  "source_tag" VARCHAR(40),
  "funder_type" VARCHAR(30),
  "funder_id" UUID,
  "memo" TEXT,
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_entry_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_account_fkey"
  FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_one_side"
  CHECK (
    ("debit_paise" > 0 AND "credit_paise" = 0)
    OR ("credit_paise" > 0 AND "debit_paise" = 0)
  );

CREATE TABLE "account_balances" (
  "account_id" UUID NOT NULL,
  "balance_paise" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_balances_pkey" PRIMARY KEY ("account_id")
);
ALTER TABLE "account_balances"
  ADD CONSTRAINT "account_balances_account_fkey"
  FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ledger_settings" (
  "id" VARCHAR(20) NOT NULL DEFAULT 'default',
  "loss_bearer" VARCHAR(20) NOT NULL DEFAULT 'pending',
  CONSTRAINT "ledger_settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "ledger_settings" ("id", "loss_bearer") VALUES ('default', 'pending')
ON CONFLICT ("id") DO NOTHING;

CREATE OR REPLACE FUNCTION ledger_refuse_mutate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_no_update
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_refuse_mutate();
CREATE TRIGGER journal_lines_no_update
  BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION ledger_refuse_mutate();

CREATE OR REPLACE FUNCTION ledger_apply_line() RETURNS trigger AS $$
DECLARE
  acct "ledger_accounts"%ROWTYPE;
  delta integer;
  bal integer;
BEGIN
  SELECT * INTO acct FROM "ledger_accounts" WHERE id = NEW.account_id;
  IF acct.type IN ('liability', 'income') THEN
    delta := NEW.credit_paise - NEW.debit_paise;
  ELSE
    delta := NEW.debit_paise - NEW.credit_paise;
  END IF;
  INSERT INTO "account_balances" ("account_id", "balance_paise", "updated_at")
  VALUES (NEW.account_id, delta, CURRENT_TIMESTAMP)
  ON CONFLICT ("account_id") DO UPDATE
    SET "balance_paise" = "account_balances"."balance_paise" + EXCLUDED."balance_paise",
        "updated_at" = CURRENT_TIMESTAMP
  RETURNING "balance_paise" INTO bal;
  IF acct.code LIKE 'WALLET:%' AND bal < 0 THEN
    RAISE EXCEPTION 'wallet overdrawn';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_apply
  AFTER INSERT ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_line();

CREATE OR REPLACE FUNCTION ledger_check_entry_balance() RETURNS trigger AS $$
DECLARE
  d integer;
  c integer;
BEGIN
  SELECT COALESCE(SUM(debit_paise), 0), COALESCE(SUM(credit_paise), 0)
    INTO d, c
  FROM "journal_lines" WHERE entry_id = NEW.entry_id;
  IF d <> c THEN
    RAISE EXCEPTION 'unbalanced journal entry';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON "journal_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balance();

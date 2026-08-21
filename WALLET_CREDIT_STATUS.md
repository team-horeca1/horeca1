# Wallet & Vendor Credit (DiSCCO Basic) — Build Status

**Updated:** 2026-08-21 — Section 6 live QA + vendor defaults UI.

## ✅ Section 6 complete for production readiness (local)

- Migration `20260821120000_discco_credit_section6` **applied** (local DB)
- Vendor **Credit defaults** UI (`/vendor/credit` → Credit defaults tab) wired to `GET|PATCH /api/v1/vendor/credit/config`
- Live headed Playwright + financial script verified:
  - new ₹37,500 credit line (custom tenure/grace/interest/penalty/repayment mode)
  - multi-supplier isolation (Daily Fresh vs Golden Grains)
  - reserve → convert → repay → cancel release
  - limit exposure reject, suspend block, cross-supplier status reject
  - concurrent ₹700+₹700 vs ₹1000 → one OK / one reject
  - customer `/wallet` shows separate supplier lines + ledger
  - RBAC: customer/vendor denied admin; unauth 401
- Unit tests: `src/modules/credit/__tests__` **11/11 PASS**
- `tsc --noEmit` **PASS**

### Local QA note
`.env.local` may override `DATABASE_URL` to tunnel `:5434`. For local QA start with:
`DATABASE_URL` from `.env` (`:5432`) — e.g. set in the shell before `npm run dev:turbo`.

## Prior waves (still valid)

See history below for engine, checkout debit, Razorpay repayment, cron, admin/vendor/customer UIs.

---

**Branch history:** originally `feat/wallet-credit`. Money-core uses `CreditWallet` (legacy `CreditAccount` retired for writes).


## ✅ Done (committed on the branch)

### Wave 1 — engine + schema (money-core)
- Schema: `GlobalCreditConfig`, `CreditWallet`, `CreditWalletTxn`, `CreditWalletRepayment`, `CreditWalletPenalty`, `CreditWalletAuditLog` (+ enums). Migration `prisma/migrations/20260607_credit_wallet`.
- Fixes vs prior: shared `@/lib/prisma` adapter; **compound interest on the captured overdue principal** (not the inflated outstanding); **per-day idempotent** interest+penalty (`@@unique(walletId,type,appliedDate)` + P2002 catch); **DB idempotency on `razorpay_payment_id`**; **H1 uniqueness** via partial unique indexes; `blacklistExempt` so reactivation-with-dues isn't re-blacklisted; unlock-amount + interest/penalty **frequency-in-days** config.
- Engine (`src/modules/credit/creditWallet.service.ts`): config resolve (global⊕override), eligibility + `maybeAutoUnlockH1Wallet`, `assignCredit`, `debitWallet`, `applyRepayment` (finalizes the pending Razorpay row), `processOverdueAccounts`, `reactivateWallet`, audit on every mutation.
- Routes (all auth-gated + Zod): `GET /wallet` (customer-scoped), `POST /wallet/create-repayment-order` (customer), `POST /wallet/razorpay-webhook` (HMAC, length-safe), `POST /wallet/debit` (admin), `POST /wallet/reactivate` (admin), `GET /wallet/reports` (admin), `POST /admin/credit/assign`, `GET|PATCH /admin/credit/config` (audited).

### Wave 2 — order/checkout integration
- Credit orders **debit `CreditWallet` inside the order transaction** (atomic; validates status/repayment-mode/limit), enforce **item `creditEligible`**, and **release on cancel** (`reverseOrderDebit`, idempotent). Draft submit debits too. Auto-unlock on the `OrderDelivered` event.
- `prisma/scripts/migrate-creditaccount-to-wallet.ts` — legacy `CreditAccount` → `CreditWallet` (preserves balances + per-account config as overrides).

### Wave 4 (backend) — accruals + reminders + cron
- `sendDueReminders` (2d/1d/0d before due + day 3 & 10 overdue → in-app/SMS/WhatsApp), `runDailyCreditTasks`, and `POST /admin/credit/cron` (CRON_SECRET-gated).

### Wave 3 (part) — customer UI
- `/wallet` dashboard: limit/available/outstanding/due + **Repay-Now (Razorpay)** + history. (Razorpay global consolidated to `src/types/razorpay.d.ts`.)

### Wave 3 UI — DONE
- **Admin** `/admin/credit`: assign/edit-limit/reactivate credit lines, search wallets (`GET /admin/credit`), the 4 reports (overdue/utilization/interest/audit), editable global config + sidebar link.
- **Checkout** "Pay via Credit": per-vendor available credit from `GET /api/v1/wallet`, blocks insufficient/blacklisted (server still does the debit).
- **Vendor** `/vendor/collections`: outstanding/due-today/overdue/high-risk + aging buckets + customer table (`GET /api/v1/vendor/credit`).
- **Legacy retired:** `/api/v1/credit/{check,apply,signup}` + `credit.service` now read `CreditWallet`; admin customer detail shows `creditWallets`. Verification script `prisma/scripts/verify-credit-wallet.ts`.

## ⏳ Remaining
- **Repoint residual legacy `CreditAccount` reads** (non-breaking — they read the still-present legacy table): vendor dashboard + ledger, the old `/api/v1/vendor/collections` route(s), admin users import/list/detail, `account/[id]`, admin vendor detail. The vendor **collections page** was replaced with a wallet-based version — legacy sub-features (ledger/statement download, mark-offline-collection, dispute notes) may need re-adding on the wallet model.
- **Split payment** ("Pay Now + Credit mix") — deferred.
- Optional missed-webhook reconcile cron (webhook is already idempotent).

## 🚀 Prod rollout (when merging to master)
1. **Back up the DB** (`docker exec horeca1-db pg_dump -U horeca1 -d horeca1 > backup.sql`).
2. Merge `feat/wallet-credit` → `master` (CI builds + deploys). The `20260607_credit_wallet` migration is **additive** (new tables only) and applies via `migrate deploy`.
3. Migrate legacy data via tunnel: `npx tsx prisma/scripts/migrate-creditaccount-to-wallet.ts --dry-run` then without `--dry-run`.
4. Set **`CRON_SECRET`** in `.env.production` and add a daily cron: `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost/api/v1/admin/credit/cron`.
5. Set the Razorpay **wallet webhook** → `https://freshville.store/api/v1/wallet/razorpay-webhook` (event `payment.captured`) using `RAZORPAY_WEBHOOK_SECRET`.

*All committed code is tsc + lint clean. Nothing is live until merged.*

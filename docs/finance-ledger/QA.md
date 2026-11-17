# Supplier Payables — QA

Checked on 17 November 2026 from branch `demo`. The local database was `127.0.0.1:5432/horeca1`. Production was not used. Demo deployment is recorded only if the demo workflow is confirmed after push.

## Commands

| Command | Result |
| --- | --- |
| `npx prisma migrate deploy` | Applied `20261117120000_supplier_payables_phase1` to the local database, after the host and database name were checked. |
| `npx tsc --noEmit` | Passed. |
| `npx vitest run src/modules/finance/__tests__` | Passed. 27 calculation and transition tests, 2 claim-exclusion tests, 1 local Postgres concurrency test. |
| `npx vitest run` | 281 passed, 11 skipped, 2 failed. The two failures are `findVendorListingWithPosSku` and `cleanupBrandArtifacts`, both `Test timed out in 5000ms` while the dev server was compiling. They are not payables tests. Re-run with `--testTimeout=20000`: 3 passed. |
| `npx playwright test e2e/supplier-payables.spec.ts` | 2 passed against `http://localhost:3000`. Repeated after screenshot cleanup: 2 passed. |

## Playwright

- Admin `admin@horeca1.com` opened `/admin/finance/payables`.
- The page shows outstanding, eligible, pending capture, awaiting completion, commission, settled, on hold, and commission-not-configured.
- Copy states that a UTR is the operator's record and that the screen does not verify it with a bank.
- Search for a missing supplier shows the empty state.
- An anonymous request to the payables API is rejected.
- No page errors were collected.
- Viewports 1440, 768, and 390. Screenshots: `docs/finance-ledger/screenshots/payables-1440.png`, `payables-768.png`, `payables-390.png`.

The local suppliers in that screenshot have no configured commission, so their payable is blocked rather than treated as 0%. Pending capture is the sale value of orders that do not have a cash payment row.

## Financial cases covered by unit tests

Positive commission, explicit 0%, missing commission, captured but not delivered, authorised, failed, non-cash methods marked captured, several cash rows, a partial collection, several refunds, a refund above the cash collected, supplier promo plus supplier coupon, a platform coupon, a suppressed promo, rewards-wallet redemption, a quantity edit together with a refund, two suppliers, hold, open batch, draft not reducing outstanding, recovery after a settled figure, UTR idempotency, and the unchanged legacy wallet formula (`10000` online at 10% is fee `1000`, gateway `200`, net `8800`).

The local Postgres test rolled back a failed claim, let only one of two concurrent claims win, and raced a finance draft against the legacy wallet batch. One owner remained.

## Not executed

- A second browser user finalising a batch in Playwright. The transition is covered by the unit test: the creator cannot finalise.
- The live demo site, until a later demo workflow run completes.

Push `5cafce2f` started [CI / Deploy Demo run 44084643167](https://github.com/team-horeca1/horeca1/actions/runs/44084643167). Type check and the image build passed. **Migrations & drift failed**, and the deploy job was skipped, so `demo.horeca1.com` did not change. The drift was seven `id` columns that had a database default Prisma does not expect. Follow-up migration `20261117123000_supplier_payables_uuid_client` removes those defaults. A fresh local database `horeca1_drift` then reproduced the CI check with no remaining drift. This note does not claim the follow-up deploy has succeeded.


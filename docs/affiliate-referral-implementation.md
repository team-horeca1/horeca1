# Earnchilada affiliate referral — implementation record

Status: implementation in progress on branch `demo` only. Production is out of scope.

## Client requirements

The site records an optional affiliate referral code. Earnchilada matches affiliates, rewards, and payouts. This app does not calculate commissions, look up affiliates, approve registrations, pay anyone, or notify affiliates.

1. Store an optional code on each new customer, supplier, and brand registration.
2. Accept `https://horeca1.com/A-0001` (on demo: `https://demo.horeca1.com/A-0001`).
3. Remember the first valid code for 30 days in cookie `h1_ref`.
4. Prefill the optional field on all three registration forms.
5. Persist a valid submitted code.
6. Empty or invalid codes do not block registration and are stored as NULL.
7. Include the code in registration exports.
8. Do not change registration, authentication, approval, or authorization behavior.
9. Run the nine acceptance checks on the isolated demo environment.

## Code policy (discrepancy resolved)

The note's validator is `^(?:H1-)?A-\d{1,6}$`. The short-link example is `/A-0001`. Both are the same code, with an optional `H1-` prefix.

One rule is used for short links, `?ref=`, manual entry, and the database:

- trim, then uppercase
- accept `A-` plus 1–6 digits, or the same value with an `H1-` prefix
- keep the prefix when it was supplied (`h1-a-12` is stored as `H1-A-12`)
- everything else, including empty input, is null
- never throw

`A-0001` is the format used by the acceptance checks.

## Architecture discovered

| Concern | Finding |
|---|---|
| Next.js | 16.1.6 App Router. Request gate is `src/proxy.ts` (`proxy`), not `middleware.ts`. |
| Customer registration | `User` (`users`) plus `BusinessAccount` (`business_accounts`, `isCustomer`). UI: `src/app/register/RegisterPageInner.tsx`. Account is created in the Auth.js OTP `authorize` path in `src/auth.ts` via `provisionDefaultAccount`. |
| Supplier registration | Same `User` + `BusinessAccount` (`isVendor`) + `Vendor` (`vendors`). Public submit: `POST /api/v1/vendor/onboarding/submit`. Logged-in add: `POST /api/v1/account`. UI: `src/app/vendor/register`. |
| Brand registration | Same `User` + `BusinessAccount` (`isBrand`) + `Brand` (`brands`). Public submit: `POST /api/v1/brand/onboarding/submit`. Logged-in add: `POST /api/v1/account`. UI: `src/app/brand/register`. |
| Shared registration row | `BusinessAccount` / `business_accounts`. The referral column is added once here. Vendor and Brand stay extensions. |
| Existing referral | Promo invite cookie `h1_referral` and `ReferralAttribution` are a separate user-to-user program. They are not Earnchilada codes and are left unchanged. |
| Middleware | `src/proxy.ts` checks admin, vendor portal, brand portal, and customer routes with Auth.js JWT. Matcher skips `api`, monitoring, and static assets. |
| Exports before this change | No customer, supplier, or brand registration export. Product and category exports exist and stay as they are. |
| Demo | `https://demo.horeca1.com`. Workflow `.github/workflows/ci-deploy-demo.yml` runs only on branch `demo`. Database `horeca1_demo` in container `horeca1-demo-db`. `deploy-demo.sh` does not touch `horeca1-app`, `horeca1-db`, or `horeca1-redis`. |
| Production | `https://horeca1.com` via `.github/workflows/ci-deploy.yml` on `master` only. Not used for this task. |

## Decisions

- Cookie name `h1_ref`, 30 days, path `/`, `SameSite=Lax`, `HttpOnly`.
- `Secure` follows the request protocol (`https:`), not `NODE_ENV`, so local HTTP still works and demo/production HTTPS stay secure.
- No `Domain` attribute. The cookie is host-only, so `demo.horeca1.com` cannot be read by `horeca1.com` or the reverse.
- First valid cookie wins. An invalid existing cookie can be replaced by a later valid code.
- Short links redirect to `/` and drop their query string. `?ref=` stays on the current URL and does not redirect.
- Forms send the field explicitly. An empty or invalid submission is NULL even if a cookie exists. Omitted field (older API clients) falls back to the cookie. Admin `POST /api/v1/account` does not read the admin browser cookie.
- A bad code is cleaned to null on the server. It is not a validation error.
- Logged-out customer `/register?role=customer` is the customer form. A signed-in visit to that URL still redirects to add-a-business; acceptance checks use a clean browser.
- Supplier and brand show the field at the bottom of the wizard, including the first step, so it is on the page when the form opens.
- Live product count: active, non-archived vendor `products` for suppliers; active `brand_master_products` for brands. Customers omit that column.
- Export: `GET /api/v1/admin/registrations/export?kind=customer|vendor|brand&format=csv|xlsx`, `adminOnly`, then `customers.view` / `vendors.view` / `brands.view`. CSV cells that start with `=`, `+`, `-`, `@`, tab, or CR are prefixed so spreadsheets do not treat them as formulas.

## Files changed

Recorded in git after the commit. See the checklist below for verification.

## Migration

- `prisma/migrations/20261023140000_business_account_referral_code`
- Adds nullable `business_accounts.referral_code VARCHAR(12)` and `business_accounts_referral_code_idx`
- Does not rewrite existing rows

## Acceptance checks

Ran on `https://demo.horeca1.com` after deploy of `64f34d4a`. Demo database only (`horeca1-demo-db` / `horeca1_demo`).

| Check | Status | Evidence |
|---|---|---|
| 1 Query `?ref=A-0001` sets `h1_ref` | PASS | `Set-Cookie: h1_ref=A-0001; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=lax` and no `Domain`. Playwright cookie domain `demo.horeca1.com`, value `A-0001`. |
| 2 Three forms prefilled with `A-0001` | PASS | Playwright read `#referral-code` on `/register?role=customer`, `/vendor/register`, and `/brand/register`. Each value was `A-0001`. |
| 3 Referred registrations store `A-0001` | PASS | Demo SQL: customer `Ref Kitchen One` / `9234510101`, supplier `Ref Supplier One` / `9234510201`, brand `Ref Brand One` / `9234510301` all have `referral_code = A-0001`. Customer was created in the browser. Supplier and brand used the public submit endpoints those forms call, after a real OTP. |
| 4 Empty code succeeds and stores NULL | PASS | Browser registration `Empty Referral Kitchen` / `9234510102` reached “Complete your profile”. SQL `referral_code` is NULL. Export cell is blank. |
| 5 `junk!!` succeeds and stores NULL | PASS | Browser accepted `junk!!` and created `Junk Referral Kitchen` / `9234510103`. SQL `referral_code` is NULL. Export cell is blank. |
| 6 `/A-0001` redirects home and sets the cookie | PASS | HTTP 307 `location: /` plus `h1_ref=A-0001`. Playwright finished on `https://demo.horeca1.com/` with cookie `A-0001`. |
| 7 Later `/A-0002` keeps `A-0001` | PASS | Request with `Cookie: h1_ref=A-0001` to `/A-0002` is 307 to `/` and does not send a new `Set-Cookie`. Playwright cookie stayed `A-0001`. An invalid existing cookie `junk!!` was replaced by a later valid code. |
| 8 Exports contain Referral Code | PASS | Admin CSV for customers, suppliers, and brands. Anonymous request is 401. Logged-in admin export is 200. Customer row `Ref Kitchen One` ends with `A-0001`; empty and junk rows end blank. Supplier and brand rows include Live Product Count `0` and `A-0001`. Export CSV buttons are on all three admin registries. XLSX returns 200. |
| 9 Existing registrations unchanged | PASS | Before tests: 19 business accounts, 19 NULL referral codes. After: 24 accounts, 21 NULL, 3 `A-0001`, and 0 codes on any other legal name. Supplier `is_verified` is false. Brand `approval_status` is pending. |

## Release evidence

- Commit `64f34d4a` on `demo` only. Not pushed to `master`.
- GitHub Actions run `39927553098` (`CI / Deploy Demo`) completed success: type check and lint, migrations and drift, image build, deploy to demo.horeca1.com.
- https://github.com/team-horeca1/horeca1/actions/runs/39927553098
- Production was not deployed.

## Commands and deployment

Local, 2026-10-23, branch `demo`:

- `npx prisma validate` — schema valid
- `npx prisma generate` — Prisma Client 7.5.0
- `npx tsc --noEmit` — exit 0
- `npx eslint --quiet` — exit 0 (no errors)
- `npx vitest run src/lib/__tests__/affiliateReferral.test.ts src/modules/registration/__tests__/registrationExportFormat.test.ts` — 22 passed
- `node scripts/audit-api-permissions.mjs --strict` — pass
- `node scripts/verify-rbac-matrix.mjs` — pass
- `npx prisma migrate deploy` — not applied locally. Postgres at `127.0.0.1:5432` was down and the Docker daemon was not running. The SQL is the pending migration. Demo CI applies migrations to a fresh database before deploy, and `deploy-demo.sh` migrates `horeca1_demo` only.

Production deployment: not authorized.

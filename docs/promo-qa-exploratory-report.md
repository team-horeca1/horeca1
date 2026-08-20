# PROMOTIONS QA SUMMARY

Exploratory Promotions / Marketing Engine QA (Phase plan execution).  
**Discover / verify / document only — no product code changes.**

## Environment

| Item | Value |
|------|--------|
| App | Turbopack `http://localhost:3000` (aligned with `AUTH_URL`) |
| Browser / Playwright MCP | **PASS** — headed Edge via user MCP `playwright` (`--browser msedge`) |
| Deterministic browser | Playwright Chromium `e2e/promotions-phase1.spec.ts` (infra flake 3/15 on turbopack) |
| Build/commit | `8329d82` |
| DB | Local seed Postgres (not dedicated e2e `:5434` stack) |

### Test accounts (from `prisma/seed.ts`)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@horeca1.com | admin123 |
| Vendor A | fresh@dailyfreshfoods.com | vendor123 |
| Vendor B | owner@spicetrail.in | vendor123 |
| Brand | brand@kitchensmith.com | brand123 |
| Customer | chef@tajpalace.com | customer123 |

## Overall status: **PASS with P2 UI findings**

| Layer | Status |
|-------|--------|
| Playwright MCP headed exploratory UI | **PASS** (Edge); pay/settle **BLOCKED** (Razorpay) |
| Authenticated API exploratory (A–H security/money) | **PASS** (39 pass / 0 fail) |
| Promo math harness | **PASS** 90/90 |
| Playwright Phase-1 e2e on turbopack+seed | **FAIL (infra)** 3/15 — login/navigation flakes; prior Phase E **14/15** |

## Counts (this session)

| | |
|--|--:|
| Total scenarios (API harness + deferred + MCP gate) | 43 |
| Passed | 39 |
| Failed (product) | 4 (P2×3, P4×1) |
| Blocked | Razorpay pay/settle only |
| Not applicable | 3 (brand promos, campaign UPI UI, partial-return clawback) |

### Critical / High / Medium / Low product bugs

| Severity | Count |
|----------|------:|
| Critical (P0) | 0 |
| High (P1) | 0 |
| Medium (P2) | 3 |
| Low (P3–P4) | 1 |

## Security findings

API session probes (cookie Auth.js login):

- Customer **cannot** mint or list admin coupons (403)
- Brand **cannot** list vendor coupons (403)
- Vendor coupons scoped to own `vendorId`; platform null rejected / forced
- Vendor **cannot** persist `audienceUserIds` (400)
- Vendor B **cannot** PATCH Vendor A coupon (404)
- Payout claim with `Origin: https://evil.example` → **403**
- Preview ignores client `discountAmount` / client prices (server re-price)
- Cashback create with `destination: 'upi'` coerced to **`wallet`** (admin + vendor)

## Financial findings

- Math suite: coupons, stacking Rules 1/2/3/5/6, wallet allocation paise, settle/duplicate settle/clawback — **90/90**
- MOV: `minOrderValue` 50000 → `valid:false` with clear message; low MOV → `estimatedDiscount: 50`
- Boundary: negative / 0 / 500% coupon values rejected (400)
- Duplicate coupon code under race: one 201 + one 409

## RBAC findings

- Direct unauthenticated GET `/admin/promotions`, `/vendor/promotions` → 307 login
- Cross-role API denials as above
- Brand portal promo create: **N/A** (deferred)

## UI findings

- Headed Edge: homepage, `/deals`, vendor Deals sheet, cart, checkout coupon apply/remove, `/rewards`
- **BUG-UI-001** Navbar hydration mismatch (P2)
- **BUG-UI-002** Rewards invite URL on `:3001` while app is `:3000` (P2)
- **BUG-UI-003** Newsletter heading missing space (P4)
- **BUG-UX-001** `/deals` shows ₹8888 cashback vs checkout estimate ₹540 for same campaign (P2)
- Coupon UI = preview API for 10% vendor coupon (₹60 / ₹540)

## Financial findings (headed)

- Invalid coupon rejected in UI
- Valid 10% coupon: preview `estimatedDiscount: 60` matches checkout −₹60
- Estimated cashback after coupon = 540 (campaign `E2E P1MT18VBM9O CBWIN`) — leftover e2e campaign on local DB
- Rewards Wallet ₹124 displayed; copy says not DiSCCO

## RBAC findings (headed)

- Customer `/admin/promotions` and `/vendor/promotions` redirect to `/`

## Regression status

| Item | Status |
|------|--------|
| Phase E math | PASS 90/90 (reconfirmed) |
| Phase E e2e (historical best) | 14/15 cited in `docs/promo-phase1-phase-e-tests-report.md` |
| Phase E e2e (this turbopack run) | 3/15 — login flake / redirect race |
| API security invariants matching Phase E | PASS via `scripts/promo-qa-api-explore.mjs` |
| Headed MCP coupon vs preview API | PASS |

## Remaining risks

1. Pay Online → deliver → settle not exercised in headed browser (Razorpay). Math + Phase E cover settle when env is healthy.
2. Local DB polluted with e2e coupons/campaigns — deactivate before a demo.
3. Turbopack e2e login flake remains; use `credentialsLogin` for deterministic suites.

## Recommended deterministic tests

- Assert referral invite URL host matches `AUTH_URL` / request origin
- Assert `/deals` cashback label uses estimate or clearly says “up to”
- Prefer `credentialsLogin` over `passwordLogin` in promo e2e

## Bug table

| ID | Severity | Area | Status | Short description |
|----|----------|------|--------|-------------------|
| BLOCK-001 | Blocker | Process | CLOSED | Playwright MCP now connected (user Edge) |
| BLOCK-002 | Blocker | Env | OPEN | Razorpay pay/settle not run in headed session |
| BUG-UI-001 | P2 | UI | OPEN | Navbar hydration mismatch on storefront |
| BUG-UI-002 | P2 | Referral | OPEN | Invite link uses localhost:3001 |
| BUG-UX-001 | P2 | Cashback UI | OPEN | Deals ₹8888 vs checkout estimate ₹540 |
| BUG-UI-003 | P4 | UI | OPEN | “onGrocery Deals” missing space |

## Artifacts

- Live defect log: [`docs/promo-qa-exploratory-defect-log.md`](./promo-qa-exploratory-defect-log.md)
- API harness: [`scripts/promo-qa-api-explore.mjs`](../scripts/promo-qa-api-explore.mjs)
- API latest stdout: [`docs/promo-qa-api-explore-latest.txt`](./promo-qa-api-explore-latest.txt)
- API JSON: [`docs/perf/promo-qa-api-explore.json`](./perf/promo-qa-api-explore.json)
- E2E latest: [`docs/promo-qa-e2e-latest.txt`](./promo-qa-e2e-latest.txt)
- Prior Phase E: [`docs/promo-phase1-phase-e-tests-report.md`](./promo-phase1-phase-e-tests-report.md)

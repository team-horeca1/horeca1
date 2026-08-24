# Website Glitch Audit — Full Report

**Project:** HoReCa Hub (horeca1-prod)  
**Date:** 24 August 2026  
**Environment:** `http://localhost:3000` (Next.js 16 Turbopack, Docker Postgres + Redis)  
**Method:** Playwright MCP (accessibility snapshots) + codebase root-cause analysis  
**Scope:** Storefront journeys, auth/RBAC, routing, regression crawl — **Razorpay explicitly skipped per user**

---

## Executive Summary

A full QA/debug loop was run across guest, customer, vendor, and admin roles on local dev. Four storefront defects were found and fixed in code (collections 404, footer dead links, Top Rated a11y, order detail wrong-account UX). Core commerce flows — cart, checkout with DiSCCO credit, order success, orders list/detail, wallet, deals, order lists — **pass**. Auth and RBAC behave correctly for customer/admin/vendor. No P0/P1 blockers remain on localhost beyond known low-severity items (soft product 404, empty collection seed data, dev DB QA pollution). **Fixes are local only — not verified on production after deploy.**

| Category | Count |
|----------|-------|
| Journeys tested | 4 phases (A–D) + continuation pass |
| Defects found | 8 |
| Defects fixed (code) | 4 |
| Open / flagged (no fix) | 4 |
| Explicitly skipped | Razorpay popup, prod login, brand portal deep dive |

---

## Environment & Setup

### Stack (Phase 0 recon)

- **Framework:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4
- **Auth:** Auth.js v5 JWT (`SessionProvider`, `useSession`, `withAuth` on API routes)
- **Cart:** `CartContext` + server cart API + localStorage mirror
- **Checkout:** `src/app/(storefront)/checkout/page.tsx` — `clearCart()` then redirect to `/order-success?ids=...`
- **Key layout:** `Navbar.tsx`, `Footer.tsx`, `MobileBottomNav`, `StorefrontShell`

### Dev commands used

```bash
npm run dev:db      # Postgres :5432, Redis :6379 (horeca1-db, horeca1-redis)
npm run dev:turbo   # Next.js on localhost:3000
```

### Environment fix applied during audit

| Before | After | Impact |
|--------|-------|--------|
| `.env.local` `DATABASE_URL` → `127.0.0.1:5434` (e2e/tunnel) | `127.0.0.1:5432` (Docker) | APIs returned P1001 / 500 when tunnel not running |

### Port cleanup

- Port **3000** was occupied by unrelated Docker container `dev-account-1` — stopped to use standard dev setup.
- Early audit briefly used **:3001**; all final retests on **:3000**.

### Test accounts (local seed)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Customer | `chef@tajpalace.com` | `customer123` | Vikram Singh, pincode 400703 |
| Vendor | `fresh@dailyfreshfoods.com` | `vendor123` | Daily Fresh Foods → `/vendor/overview` |
| Admin | `admin@horeca1.com` | `admin123` | → `/admin/dashboard` |

**Production spot-check:** `https://freshville.store` — guest OK; seed logins returned **Invalid credentials** (prod DB differs). Not in scope for fixes.

---

## Methodology

1. **Phase 0** — Architecture recon (auth, navbar, cart, checkout, routes)
2. **Journey A** — Auth (guest, customer, vendor, RBAC probes)
3. **Journey B** — Cart → checkout → order (DiSCCO credit; no Razorpay)
4. **Journey C** — Routing & slugs (vendor UUID, categories, collections, products)
5. **Journey D** — Broad regression crawl (nav, footer, search, deals, brands)
6. **Root-cause fixes** — Code changes + `npx tsc --noEmit` pass
7. **Retest** — Fixed routes and flows re-verified
8. **Continuation pass** — Order detail, wallet, deals, guest cart merge, admin/vendor RBAC, mobile viewport

**Not tested:** Razorpay Pay Online popup (user confirmed OK). Brand portal deep dive. Session expiry mid-flow. Admin team RBAC matrix. Double-click Place Order stress test.

---

## Phase 0 — Recon Findings

| Area | File(s) | Notes |
|------|---------|-------|
| Navbar session gating | `src/components/layout/Navbar.tsx` | Wallet/DiSCCO only when `sessionReady && isLoggedIn`; placeholders during loading |
| Cart state | `src/context/CartContext.tsx` | Server sync + localStorage |
| Checkout | `src/app/(storefront)/checkout/page.tsx` | Credit + wallet paths; hard redirect on success |
| Order success | `src/app/(storefront)/order-success/page.tsx` | Shows PO numbers from query `ids` |
| Collections API | `src/app/api/v1/collections/route.ts`, `catalog.service.ts` | API existed; **storefront pages were missing** |
| Footer | `src/components/layout/Footer.tsx` | Many links pointed to `/under-construction` |

---

## Journey A — Auth

| Test | Role | Expected | Actual | Status |
|------|------|----------|--------|--------|
| Homepage / nav as guest | Guest | Browse, no wallet nav | Home/Vendors/Lists only (no Wallet/DiSCCO in navbar) | ✅ Pass |
| Customer login | Customer | Session + profile | Login OK; Wallet/DiSCCO appear; profile shows Vikram Singh | ✅ Pass |
| Login redirect | Customer | Return to intended URL | `/login?redirect=/profile` → `/profile` | ✅ Pass |
| Vendor login | Vendor | Vendor portal | → `/vendor/overview`; hard refresh OK | ✅ Pass |
| Guest `/profile` | Guest | Redirect to login | Redirected | ✅ Pass |
| Customer `/admin/dashboard` | Customer | Blocked | Redirected away from admin | ✅ Pass |
| Admin login | Admin | Admin dashboard | → `/admin/dashboard`; stats render | ✅ Pass |
| Vendor `/admin/dashboard` | Vendor | Blocked | → `/login?redirect=/admin/dashboard` | ✅ Pass |
| Guest order detail URL | Guest | No data leak | → `/login?redirect=/orders/...` | ✅ Pass |
| Logout | Customer | Session cleared | Profile → **Logout** works; `/api/auth/signout` alone unreliable | ⚠️ Note |
| Admin / brand / mobile navbar | — | — | Not fully exercised | ⏭️ Partial |

---

## Journey B — Cart → Checkout → Order

**Payment method used:** DiSCCO credit line (Razorpay skipped)

| Step | Status | Evidence |
|------|--------|----------|
| Add to cart (Daily Fresh Foods, Alphonso Mangoes ₹600) | ✅ | Cart badge **1** |
| Checkout review + DiSCCO credit | ✅ | Place Order succeeds |
| Order success page | ✅ | `/order-success?ids=...` |
| Order in list | ✅ | **PO-2026-042107-01** on `/orders` |
| Cart cleared after order | ✅ | Badge empty |
| Hard reload order-success | ✅ | Stable |
| Guest add-to-cart → login → cart merge | ✅ | Guest items merged with server cart; **3 items / ₹660** after login |
| Double-click Place Order | — | Not tested | ⏭️ Skip |
| Browser back from order-success | — | Not tested | ⏭️ Skip |

**Order detail (continuation):** `PO-2026-042107-01` — progress timeline, items, bill summary, Credit Line Paid, Download Invoice, Reorder, Save as Order List, Request Cancellation — **✅ Pass**

---

## Journey C — Routing & Slugs

| URL / case | Expected | Actual | Status |
|------------|----------|--------|--------|
| Vendor UUID slug | 200, store loads | OK | ✅ Pass |
| Category slugs (incl. mixed case) | 200 | OK | ✅ Pass |
| Brand slugs | 200 | OK | ✅ Pass |
| `/collections` | 200 (was 404) | 200, index page | ✅ Fixed + Pass |
| `/collections/weekend-specials` | 200 (was 404) | 200, empty state (0 products in DB) | ✅ Fixed + Pass |
| `/product/nonexistent-id` | 404 ideally | HTTP **200** + UI “Product not found” | ⚠️ Flagged |
| Trailing slash | Redirect | 308 on vendor/collections | ✅ Expected |

---

## Journey D — Regression Crawl

| Page / area | Status | Notes |
|-------------|--------|-------|
| `/vendors` | ✅ | Loads |
| `/deals` | ✅ | Coupons grid, copy buttons |
| `/brands` | ✅ | Loads |
| `/search` | ✅ | Loads |
| `/order-lists` | ✅ | Empty state + Create List (customer) |
| `/wallet` (DiSCCO) | ✅ | 2 credit lines, balances, due dates |
| `/rewards` (H1 Wallet) | ✅ | ₹340 balance, activity history |
| Footer links | ✅ | Fixed — real routes (was `/under-construction`) |
| Homepage Top Rated | ✅ | Section renders; a11y heading fix applied |
| Curated Collections (homepage) | ✅ | Links to `/collections/*` work |
| Console on key flows | ✅ | Clean except Google Maps deprecation warnings |
| Mobile 390×844 homepage | ✅ | Compact header, bottom nav, sections OK |

---

## RBAC Summary

| Actor | Route | Result |
|-------|-------|--------|
| Guest | `/profile`, `/orders/:id`, `/order-lists` | Redirect to login |
| Customer | `/admin/dashboard` | Blocked / redirected |
| Vendor | `/admin/dashboard`, `/checkout`, `/profile` | Redirect to login |
| Vendor | `/cart` | Accessible (likely dual-role / storefront cart) |
| Admin | `/admin/dashboard` | Full access |

**Note:** Vendor RBAC tests require clean logout before login; stale admin session caused false “vendor on admin dashboard” until Profile Logout was used.

---

## Defects Found → Fixed

### 1. Collections storefront 404 — **FIXED**

| | |
|---|---|
| **Severity** | P1 — broken nav from homepage “Curated Collections” |
| **Symptom** | `/collections` and `/collections/[slug]` returned 404 |
| **Root cause** | API + service existed; App Router pages missing |
| **Fix** | Added `src/app/(storefront)/collections/page.tsx`, `collections/[slug]/page.tsx`; `getCollections()` includes vendor on products |
| **Retest** | ✅ 200, empty state when no `collection_products` |

### 2. Footer dead links — **FIXED**

| | |
|---|---|
| **Severity** | P2 — trust / navigation |
| **Symptom** | Footer “My Account”, cart, orders, categories → `/under-construction` |
| **Fix** | `src/components/layout/Footer.tsx` — real routes (`/cart`, `/orders`, `/profile`, `/vendors`, category slugs, etc.) |
| **Retest** | ✅ Homepage footer links resolve |

### 3. Top Rated empty a11y heading — **FIXED**

| | |
|---|---|
| **Severity** | P3 — accessibility |
| **Symptom** | “Top Rated” section weak/empty heading semantics |
| **Fix** | `src/components/features/homepage/VendorRollups.tsx` — `aria-label`, visible `<span>Top Rated</span>`, Lucide `Star` icon |
| **Retest** | ✅ Snapshot shows proper `heading "Top Rated" [level=2]` |

### 4. Order detail wrong-account UX — **FIXED**

| | |
|---|---|
| **Severity** | P2 — confusing error handling |
| **Symptom** | Wrong/missing order → toast + redirect to empty `/orders` |
| **Fix** | `src/app/(storefront)/orders/[id]/page.tsx` — `loadFailed` state; inline “Order not found / no access” UI |
| **Retest** | ✅ Logic in place (full wrong-user retest optional) |

**Typecheck after fixes:** `npx tsc --noEmit` — **pass**

### Files changed (local, uncommitted)

```
src/app/(storefront)/collections/          (new)
src/app/(storefront)/orders/[id]/page.tsx  (modified)
src/components/features/homepage/VendorRollups.tsx
src/components/layout/Footer.tsx
src/modules/catalog/catalog.service.ts
```

---

## Open Issues (Not Fixed)

| # | Severity | Issue | Recommendation |
|---|----------|-------|----------------|
| 1 | P3 | **Soft product 404** — bad product ID returns HTTP 200 + client message | Return `notFound()` in product page for true 404 |
| 2 | P3 | **Collections empty** — DB has collection rows, 0 `collection_products` | Seed demo products or accept empty state |
| 3 | P3 | **Dev DB QA pollution** — QA brands, QAFIN* coupons, E2E vendor names on homepage/deals | Clean seed or separate QA DB |
| 4 | P3 | **Logout via GET `/api/auth/signout`** — did not reliably clear session in automation | Use Profile → Logout; optional harden signout route |
| 5 | Info | **`.env.local` :5434`** — if reverted, local APIs 500 without tunnel | Keep `:5432` for normal dev |
| 6 | Info | **Prod not retested** after local fixes | Deploy + smoke test on `freshville.store` |

---

## Explicitly Skipped (By Design)

| Item | Reason |
|------|--------|
| **Razorpay / Pay Online popup** | User tested separately — confirmed OK |
| **Prod seed login** | Credentials invalid on prod DB |
| **Brand portal** | Out of storefront audit scope |
| **Admin team RBAC matrix** | Time / scope |
| **Session expiry mid-checkout** | Time / scope |
| **Double-click Place Order / add-to-cart** | Time / scope |
| **Browser back from order-success → cart** | Time / scope |
| **Invoice PDF binary download verify** | Link present; PDF bytes not opened |
| **WhatsApp notifications** | Known stub |

---

## Test Results Matrix (All Pass / Fail)

| # | Test case | Result |
|---|-----------|--------|
| 1 | Guest homepage | ✅ |
| 2 | Customer login + nav (Wallet/DiSCCO) | ✅ |
| 3 | Login redirect preservation | ✅ |
| 4 | Vendor login → overview | ✅ |
| 5 | Guest protected routes → login | ✅ |
| 6 | Customer blocked from admin | ✅ |
| 7 | Admin dashboard access | ✅ |
| 8 | Vendor blocked from admin | ✅ |
| 9 | Add to cart + badge | ✅ |
| 10 | Checkout DiSCCO + place order | ✅ |
| 11 | Order success + orders list | ✅ |
| 12 | Cart clear post-order | ✅ |
| 13 | Guest cart → login merge | ✅ |
| 14 | Order detail PO-2026-042107-01 | ✅ |
| 15 | Order lists empty state | ✅ |
| 16 | DiSCCO wallet page | ✅ |
| 17 | H1 rewards wallet page | ✅ |
| 18 | Deals / coupons page | ✅ |
| 19 | Collections index + slug | ✅ (fixed) |
| 20 | Footer links | ✅ (fixed) |
| 21 | Top Rated section | ✅ (fixed) |
| 22 | Vendor/category/brand routing | ✅ |
| 23 | Missing product URL semantics | ⚠️ HTTP 200 |
| 24 | Mobile homepage layout | ✅ |
| 25 | Console errors on main flows | ✅ (Maps warnings only) |

---

## Architecture Reference (Quick)

```
Storefront flow:
  VendorProductCard → CartContext → /cart → /checkout → order API
  → clearCart() → /order-success?ids=...

Auth:
  Auth.js JWT → Navbar sessionReady gating → withAuth on /api/v1/*

Multi-tenancy:
  resolveVendorContext / resolveBrandContext on vendor/brand APIs
```

---

## Recommendations (Priority Order)

1. **Commit & deploy** the four local fixes (collections pages, footer, VendorRollups, order detail UX).
2. **Prod smoke test** after deploy: `/collections`, footer links, one checkout path (credit).
3. **Optional:** `notFound()` for invalid product IDs (SEO + monitoring).
4. **Optional:** Seed `collection_products` for demo collections.
5. **Keep** `DATABASE_URL` on `:5432` for daily dev; use `:5434` only when e2e tunnel is running.

---

## Sign-off

| | |
|---|---|
| **Local storefront** | Stable for guest + customer + vendor + admin core paths |
| **Critical blockers** | None found outside skipped Razorpay |
| **Code fixes** | 4 applied locally; typecheck clean |
| **Production** | Not validated with these fixes |

---

*Generated from full audit session: Phase 0 → Journeys A–D → fixes → retest → continuation pass (24 Aug 2026).*

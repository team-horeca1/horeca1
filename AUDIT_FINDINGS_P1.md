# Customer Pack P1 — Audit Findings

**Date:** 2026-07-15  
**Base URL:** http://localhost:3000  
**Account:** `chef@tajpalace.com` (seed customer) · cookie jar `audit-cust-cookies.txt`  
**Tools:** Playwright MCP (`user-playwright`) + `curl.exe` with cookie jars  
**Scope:** Customer pack P1 only — **no application code changes**

---

## Executive summary

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High     | 3 |
| Medium   | 4 |
| Low      | 3 |

Checkout reached payment method selection and was abandoned (no live Razorpay charge). Oversell was correctly rejected. Logout clears session (`/api/v1/auth/me` → 401). Several High issues are reliability/permission problems that block store browsing and outlet/address RBAC.

---

## Bugs

### P1-001 — Vendor store hangs on “Loading store…” when products API fails/times out

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Confidence** | High |
| **Steps** | 1. Login as customer. 2. Open `/vendor/green-valley-organics`. 3. Observe main content. |
| **Expected** | Store header + product grid load within a few seconds, or a clear error/retry UI. |
| **Actual** | UI stayed on **“Loading store…”** for 10s+. Console: `500` on `/api/v1/vendors/green-valley-organics/products?limit=200&pincode=400705` and `Error: timeout exceeded when trying to connect` from `apiFetch` / `getProducts`. Same endpoint later returned **200** with products under lighter load (flaky). |
| **Hypothesis** | Prisma/DB pool exhaustion or slow query under concurrent requests; client has no timeout/error recovery for the store products Promise, so the loading skeleton never exits. |
| **Related files** | `src/app/api/v1/vendors/[id]/products/route.ts`; vendor store page / client fetch in catalog modules; `apiFetch` timeout handling |

---

### P1-002 — Customer cannot GET account outlets (`403 Requires outlets.view`)

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Confidence** | High |
| **Steps** | 1. Login as `chef@tajpalace.com`. 2. `GET /api/v1/account` → 200 with BA `a35894b8-…`. 3. `GET /api/v1/account/a35894b8-461b-4194-add6-0e529c62129f/outlets`. |
| **Expected** | Account owner/customer can list own outlets (or a customer-scoped addresses path is used instead). |
| **Actual** | **403** `{"code":"FORBIDDEN","message":"Requires outlets.view"}` (reproduced multiple times in browser console while using profile/home). |
| **Hypothesis** | Outlets API is gated on vendor-style `outlets.view` permission; seeded customer membership lacks it. Profile/address flows that call this endpoint fail even though `/api/v1/addresses` works. |
| **Related files** | `src/app/api/v1/account/[id]/outlets/route.ts`; `src/lib/permissions/apiPermissions.ts`; `src/components/auth/ProfileScreen.tsx` |

---

### P1-003 — Multi-second / ~50s API latency under concurrent customer traffic

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Confidence** | High |
| **Steps** | Browse home, vendor store, cart, notifications while other API probes run. |
| **Expected** | Typical API responses well under a few seconds locally. |
| **Actual** | Performance entries showed ~51–54s durations for `/api/v1/account`, `/api/v1/cart`, `/api/v1/wallet`, `/api/v1/notifications`, `/api/v1/addresses`, vendor products. Correlated with store hang (P1-001) and intermittent empty UI. |
| **Hypothesis** | Connection pool / lock contention on Postgres or Next.js dev server overload; cascading timeouts in the client. |
| **Related files** | `src/lib/prisma.ts`; rate limiter / Redis; hot paths in cart & catalog services |

---

### P1-004 — Search “rice” intermittently shows zero UI results while API returns products

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | Medium |
| **Steps** | 1. Ensure pincode/context 400705. 2. Open `/search?q=rice`. |
| **Expected** | Results matching `/api/v1/search?q=rice` (3 products incl. Sona Masoori / Basmati for pin 400705). |
| **Actual** | First run: UI **“No results for rice”**. Immediate API check: **200**, 3 products. Retry later: UI **All (6) / Products (3)** correctly. Tomato search worked on first try. |
| **Hypothesis** | Race/timeout in search page fetch, or pincode context not ready on first paint so client filters to empty then fails to refresh. |
| **Related files** | `src/app/search/page.tsx`; `src/app/api/v1/search/route.ts` |

---

### P1-005 — Invoice endpoint returns 500 for malformed order id

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | High |
| **Steps** | Authenticated `GET /api/v1/orders/fake-id/invoice`. |
| **Expected** | **400** validation or **404** not found. |
| **Actual** | **500** `INTERNAL_ERROR` / “Something went wrong”. Valid UUID missing order → **404** `Order not found` (correct). |
| **Hypothesis** | Prisma throws on invalid UUID before Zod/validation maps to 4xx. |
| **Related files** | `src/app/api/v1/orders/[id]/invoice/route.ts` |

---

### P1-006 — Nav “Offers” goes to under-construction

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | High |
| **Steps** | Click **Offers** in desktop nav. |
| **Expected** | Live offers/deals experience (or hide the link). |
| **Actual** | Navigates to `/under-construction`. |
| **Hypothesis** | Feature intentionally deferred but still linked in primary nav. |
| **Related files** | `src/components/layout/Navbar.tsx` |

---

### P1-007 — Browser autofill can sign customer into wrong role/account

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | Medium |
| **Steps** | On `/login`, switch to password mode; fill customer email; submit. |
| **Expected** | Submitted credentials are used. |
| **Actual** | Autofill replaced email with `fresh@dailyfreshfoods.com`; session became vendor (Dashboard link + “Daily Fresh Foods has been approved” banner). |
| **Hypothesis** | Password managers overwrite fields after fill; no `autocomplete` hardening / confirmation of identity after login. |
| **Related files** | Login form component under `src/app/(routes)` / auth features |

---

### P1-008 — Google Maps Places legacy API console warnings

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Confidence** | High |
| **Steps** | Load homepage / open location picker. |
| **Expected** | No deprecation warnings (or migrated Places API). |
| **Actual** | Repeated warnings: `AutocompleteService` / `PlacesService` not available to new customers; migrate to `AutocompleteSuggestion` / `Place`. |
| **Hypothesis** | Hooks still use legacy Maps Places JS APIs. |
| **Related files** | `src/hooks/useGooglePlacesAutocomplete*` (or Address overlay) |

---

### P1-009 — Next.js `<Image>` sizing / `sizes` warnings on high-traffic pages

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Confidence** | High |
| **Steps** | Browse home / categories. |
| **Expected** | Clean console for production polish. |
| **Actual** | Warnings: logo/hero width/height mismatch; category/product images with `fill` missing `sizes`. |
| **Hypothesis** | Incomplete Next Image props on homepage/category cards. |
| **Related files** | Homepage / Navbar / category card components |

---

### P1-010 — Cart UI empty / badge 0 when session drops while server cart still has items

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Confidence** | Medium |
| **Steps** | Add items (API 201 qty=5); later lose session mid-session; open `/cart`. |
| **Expected** | Prompt to re-login and restore cart, or consistent empty state only after confirmed logout. |
| **Actual** | Cart page “No items in cart” and badge **0** while prior authenticated `GET /api/v1/cart` still had Green Valley items; subsequent unauthenticated cart POST → 401. |
| **Hypothesis** | Client cart context clears on session loss without merge-on-relogin messaging. |
| **Related files** | `src/context/CartContext.tsx`; cart merge API |

---

## PASS checks

| ID | Check | Result |
|----|-------|--------|
| PASS-01 | Login customer (credentials + CSRF cookie jar) | **PASS** — session cookie set; redirect `/` |
| PASS-02 | `GET /api/v1/auth/me` while logged in | **PASS** — 200; `chef@tajpalace.com`, role `customer`, pincode `400705` |
| PASS-03 | Homepage browse (hero, vendors, categories) | **PASS** — renders; 0 console *errors* on healthy loads |
| PASS-04 | Search tomato (`/search?q=tomato`) | **PASS** — products + vendors; pin filter banner for 400705 |
| PASS-05 | Search rice API (`/api/v1/search?q=rice`) | **PASS** — 200, 3 products (UI flaky → P1-004) |
| PASS-06 | Pincode / delivery context 400705 | **PASS** — profile default delivery Navi Mumbai · 400705; checkout “DELIVERING TO … 400705” |
| PASS-07 | Add to cart (`POST /api/v1/cart`) | **PASS** — 201; qty update reflected |
| PASS-08 | `/cart` vendor-grouped UI | **PASS** — Green Valley Organics, bill summary, Checkout CTA (when authenticated) |
| PASS-09 | Oversell qty (99999) POST + PATCH item | **PASS** — 400 `OUT_OF_STOCK` “… only 150 units available” |
| PASS-10 | Checkout path to payment methods | **PASS** — Review PO → Continue to Payment → Pay Online / Credit / Wallet / Bank / PO; **abandoned before Pay Online** (no charge) |
| PASS-11 | Orders list (empty) | **PASS** — API `orders: []`; UI “My Orders” / loading→empty reachable when session healthy |
| PASS-12 | Invoice for missing UUID order | **PASS** — 404 `Order not found` |
| PASS-13 | `/order-lists` empty state | **PASS** — “No order lists yet” + Create CTA |
| PASS-14 | `/profile` account screen | **PASS** — Vikram Singh, email, phone, business, shortcuts (when load completes) |
| PASS-15 | `/wallet` empty credit state | **PASS** — “No credit wallet yet” messaging |
| PASS-16 | `/rewards` | **PASS** — Rewards wallet ₹0 + empty activity |
| PASS-17 | `/vendors` directory | **PASS** — vendor cards with MOV/ratings |
| PASS-18 | Bad password login | **PASS** — redirect `?error=CredentialsSignin`; `/auth/me` **401** |
| PASS-19 | Logout → `/api/v1/auth/me` | **PASS** — cookie-jar `POST /api/auth/signout` then me → **401 UNAUTHORIZED** |
| PASS-20 | Addresses API | **PASS** — `GET /api/v1/addresses` 200 with saved outlets/addresses for customer |

---

## Negative / incomplete notes

| Check | Status | Notes |
|-------|--------|-------|
| Empty login/register form submit (UI) | **Partial** | Playwright session contested by parallel vendor-portal navigation; empty OTP/password UI validation not stably captured this run. HTML login exposes OTP-first + password mode. Recommend re-run in isolation. |
| Empty register submit | **Partial** | Same — blocked mid-run. |
| Invoice download (happy path) | **N/A** | No prior customer orders in seed for this user; cannot download real PDF. |
| Complete Razorpay payment | **Skipped** | Reached “Pay Online →”; intentionally abandoned. |

---

## Console / network highlights

- **Errors:** vendor products **500** + `timeout exceeded when trying to connect`; repeated **403** on `.../account/.../outlets`.
- **Warnings:** Maps Places deprecation; Next/Image `sizes` / aspect-ratio.
- **Slow resources:** many `/api/v1/*` calls ~50s under load (see P1-003).

---

## Suggested fix priority (for eng — not done in this audit)

1. P1-001 + P1-003 — stabilize vendor products + DB pool; store error UI  
2. P1-002 — grant customer outlet read or stop calling vendor permission on customer BA  
3. P1-004 — search loading/error retry  
4. P1-005 — validate order id before Prisma  
5. P1-006 / P1-007 — nav honesty + login autocomplete  

---

*End of Customer Pack P1 audit.*

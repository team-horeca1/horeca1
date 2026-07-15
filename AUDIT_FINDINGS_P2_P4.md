# Audit Findings — Packs P2 / P3 / P4

**Date:** 2026-07-15  
**Base URL:** http://localhost:3000  
**Method:** Playwright MCP (`user-playwright`) + `curl.exe` cookie jars (`audit-vend-cookies.txt`, `audit-admin-cookies.txt`)  
**Accounts:** seed vendor `fresh@dailyfreshfoods.com`, disposable vendor `audit.vendor.1784132100999@example.com`, seed brand `brand@kitchensmith.com`, admin `admin@horeca1.com`  
**Scope:** Vendor portal routes, brand portal (brief), admin list/detail/settings/impersonation/logout. **No application code fixes. No destructive writes to real seed data.**

---

## Summary counts

| Pack | Bugs | PASS checks |
|------|------|-------------|
| **P2 Vendor** | **6** | **18** |
| **P3 Brand** | **2** | **6** |
| **P4 Admin** | **2** | **16** |
| **Total** | **10** | **40** |

---

## Pack P2 — Vendor portal

### Bugs

#### P2-001 — Verified vendors stuck with incomplete setup wizard
- **Severity:** High  
- **Evidence:** `GET /api/v1/vendor/setup` for seed Daily Fresh and disposable Audit Vendor Hub returns `wizardComplete: false`, `completedRequired: false`, `progress: {}` while `isVerified: true`.  
- **UI:** Login / some deep links land on `/vendor/setup` (“Step 2 of 9 · 0/8 completed”). Dashboard shows persistent banner: “Complete your store setup… Continue Setup”.  
- **Impact:** Verified vendors with live catalog (seed has 7 products) are treated as unfinished onboarding.

#### P2-002 — `/vendor/brand-mappings` redirected to setup wizard
- **Severity:** High  
- **Evidence:** Playwright navigate to `/vendor/brand-mappings` as seed vendor → final URL `/vendor/setup` (Store Profile step).  
- **API:** `GET /api/v1/vendor/brand-mappings` returns 200 with empty mapping buckets when not redirected.  
- **Impact:** Brand-mapping workflow unreachable until wizard is completed (even when vendor is already verified).

#### P2-003 — Marketplace chrome / cart poll bleeds into vendor (and brand) sessions
- **Severity:** Medium  
- **Evidence:** Several vendor pages briefly or intermittently show marketplace nav (“Search / DELIVER TO / Home Vendors Offers Lists”). Console/API: `GET /api/v1/cart` → **400** `Select a delivery address before placing orders.` for non-customer roles (also observed on brand portal).  
- **Impact:** Noisy console errors; confusing dual chrome; cart client should no-op for vendor/brand/admin.

#### P2-004 — “Loading active outlet…” hangs on first paint
- **Severity:** Low–Medium  
- **Evidence:** Multiple `/vendor/*` pages render sidebar with “Loading active outlet…” for several seconds before outlet context resolves (“OPERATING FROM Daily Fresh Foods Primary”).  
- **Impact:** Looks broken on slow loads; content below may appear empty until outlet hydrates.

#### P2-005 — Missing dedicated vendor APIs (404) for warehouse / sales-team paths
- **Severity:** Low  
- **Evidence:** `GET /api/v1/vendor/warehouse` → **404** (HTML not-found). `GET /api/v1/vendor/sales-team` → **404**. Related APIs that do work: `/api/v1/vendor/salespersons` 200, `/api/v1/vendor/commissions` 200.  
- **UI:** `/vendor/warehouse` and `/vendor/sales-team` pages exist and eventually render (“Warehouse Ops”, sales-team shell).  
- **Impact:** Any client calling the pluralized/resource paths named like the routes will fail; docs/clients may be misled.

#### P2-006 — Intermittent blank main content on orders / notifications / sales-team
- **Severity:** Low  
- **Evidence:** First-pass Playwright reads sometimes returned empty `body` text with only shell/`h1: Horeca1`. Longer waits (5–6s) usually revealed sidebar + empty-state content. No Access Denied / 500 on those routes when authenticated as vendor.  
- **Impact:** Flaky UX on cold compile / slow hydration (dev server); monitor in prod.

### PASS checks (P2)

| ID | Check | Result |
|----|-------|--------|
| P2-PASS-01 | Vendor credentials login (`fresh@…` / `vendor123`) → `/api/v1/auth/me` role `vendor` | PASS |
| P2-PASS-02 | Disposable vendor login (`audit.vendor…` / `AuditVend1!`) → auth/me 200 | PASS |
| P2-PASS-03 | `/vendor/dashboard` loads Vendor Panel + ops widgets (when not forced solely to setup) | PASS |
| P2-PASS-04 | `/vendor/products` lists catalog (7 products seed) | PASS |
| P2-PASS-05 | Add Product UI opens form (name/SKU/HSN/brand/categories/tax…) | PASS |
| P2-PASS-06 | Product create **Cancel** returns to products list without create | PASS |
| P2-PASS-07 | `/vendor/orders` loads (empty orders OK) | PASS |
| P2-PASS-08 | `/vendor/inventory` loads | PASS |
| P2-PASS-09 | `/vendor/warehouse` page loads (“Warehouse Ops”) | PASS |
| P2-PASS-10 | `/vendor/settings` loads | PASS |
| P2-PASS-11 | `/vendor/team` loads | PASS |
| P2-PASS-12 | `/vendor/wallet`, `/vendor/credit`, `/vendor/ledger` load | PASS |
| P2-PASS-13 | `/vendor/reports`, `/vendor/returns`, `/vendor/claims`, `/vendor/customers` load | PASS |
| P2-PASS-14 | `/vendor/promotions`, `/vendor/price-lists`, `/vendor/outlets` load | PASS |
| P2-PASS-15 | `/vendor/account`, `/vendor/notifications`, `/vendor/sales-team` load (after wait) | PASS |
| P2-PASS-16 | Core vendor APIs 200: products, orders, inventory, dashboard, wallet, credit, team, settings, returns, claims, customers, promotions, price-lists, outlets, reports, brand-mappings, ledger, notifications | PASS |
| P2-PASS-17 | Admin **Impersonate** on vendor detail → `/vendor/dashboard` with **ADMIN VIEW · Daily Fresh Foods · Exit Admin View** | PASS |
| P2-PASS-18 | Under Admin View: `GET /api/v1/vendor/dashboard` 200 (7 active products); notifications endpoint 200 scoped to session (empty list; no cross-tenant leak observed) | PASS |

### Impersonation / notifications note
- `POST /api/v1/admin/impersonate` with `{"vendorId":"<uuid>"}` → 200 `{ outletId }`.  
- `DELETE /api/v1/admin/impersonate` → 200 exit.  
- Session remains `role: admin`; vendor APIs are outlet-scoped. Notifications stayed empty for both admin and seed vendor — no evidence of vendor→admin leakage in this pass.

---

## Pack P3 — Brand portal (brief)

### Bugs

#### P3-001 — Brand portal triggers customer cart API (400)
- **Severity:** Medium  
- **Evidence:** On `/brand/portal/*`, console errors: `GET /api/v1/cart` → **400** `Select a delivery address before placing orders.`  
- **Impact:** Same marketplace cart bleed as P2-003; brand users should not hit cart.

#### P3-002 — `/api/v1/brand/dashboard` (and `/api/v1/brand/settings`) return 404
- **Severity:** Low  
- **Evidence:** curl + browser: `/api/v1/brand/dashboard` **404**; `/api/v1/brand/settings` **404**. UI dashboard still renders after ~5–10s via other endpoints (`/api/v1/brand/products`, `/api/v1/brand/analytics` 200).  
- **Impact:** Slow first paint (“Loading brand dashboard…”); broken if UI ever depends solely on those paths.

### PASS checks (P3)

| ID | Check | Result |
|----|-------|--------|
| P3-PASS-01 | Brand login `brand@kitchensmith.com` / `brand123` → role `brand` | PASS |
| P3-PASS-02 | `/brand/portal` dashboard eventually shows Kitchen Smith / Approved / 3 products | PASS |
| P3-PASS-03 | `/brand/portal/products` lists brand SKUs | PASS |
| P3-PASS-04 | `/brand/portal/distributors` loads Distributor Network | PASS |
| P3-PASS-05 | `/brand/portal/analytics` loads metrics (zeros OK) | PASS |
| P3-PASS-06 | `/brand/portal/team` + `/brand/portal/settings` load | PASS |

---

## Pack P4 — Admin portal

### Bugs

#### P4-001 — `/admin/brand-distributor-invites` UI redirects to dashboard
- **Severity:** Medium  
- **Evidence:** Playwright navigate → final URL `/admin/dashboard`. API `GET /api/v1/admin/brand-distributor-invites` returns **200** `{ invites: [] }`.  
- **Impact:** Invite admin UI unreachable from route (API works).

#### P4-002 — Approvals page incomplete loading / missing dedicated approvals API
- **Severity:** Low–Medium  
- **Evidence:** UI shows tabs + “No pending vendors” then trailing **“Loading…”**. `GET /api/v1/admin/approvals` → **404**. Pending vendors via `GET /api/v1/admin/vendors?status=pending` returns data (includes disposable Audit Vendor Hub).  
- **Impact:** Approvals UX may never finish loading some tabs; API naming inconsistent.

### PASS checks (P4)

| ID | Check | Result |
|----|-------|--------|
| P4-PASS-01 | Admin login → `/api/v1/auth/me` role `admin` | PASS |
| P4-PASS-02 | `/admin/dashboard` loads | PASS |
| P4-PASS-03 | List pages HTTP 200: orders, vendors, customers, brands, products, categories, approvals, finance, credit, team, audit-logs, settings, returns, claims, reports, ledger, promotions | PASS |
| P4-PASS-04 | Playwright: all major admin list pages render ADMIN PANEL without Access Denied / 500 | PASS |
| P4-PASS-05 | `/admin/settings` shows Business Settings / platform fee; API `defaultCommissionPct: 10` | PASS |
| P4-PASS-06 | `/admin/customers` registry loads | PASS |
| P4-PASS-07 | `/admin/vendors` registry loads | PASS |
| P4-PASS-08 | Disposable vendor detail `/admin/vendors/58234d04-eb99-4bb1-a02a-374f68e95351` — Audit Vendor Hub, MOV/coverage, Impersonate/Edit | PASS |
| P4-PASS-09 | `/admin/brands`, `/admin/products`, `/admin/categories` load | PASS |
| P4-PASS-10 | `/admin/finance`, `/admin/credit`, `/admin/team`, `/admin/audit-logs` load | PASS |
| P4-PASS-11 | Impersonate API + UI (see P2-PASS-17/18) | PASS |
| P4-PASS-12 | Exit impersonation `DELETE /api/v1/admin/impersonate` 200 | PASS |
| P4-PASS-13 | **Logout** (Auth.js signout) → `GET /api/v1/auth/me` **401** `UNAUTHORIZED` | PASS |
| P4-PASS-14 | Playwright logout path also yielded auth/me **401** | PASS |
| P4-PASS-15 | No destructive creates/edits/deletes performed on seed data | PASS |
| P4-PASS-16 | Brand-distributor-invites **API** healthy (empty list) despite UI redirect | PASS (API only) |

---

## Route coverage matrix (condensed)

### Vendor (`/vendor/*`)
| Route | HTTP | Notes |
|-------|------|-------|
| dashboard | 200 | Setup nag banner (P2-001) |
| products | 200 | Create+cancel PASS |
| orders | 200 | Empty OK |
| inventory | 200 | |
| warehouse | 200 | Page OK; API path 404 (P2-005) |
| settings | 200 | |
| team | 200 | |
| wallet / credit / ledger | 200 | |
| reports / returns / claims / customers | 200 | |
| promotions / price-lists / outlets | 200 | |
| account / notifications / sales-team | 200 | Slow first paint (P2-006) |
| brand-mappings | → setup | **P2-002** |

### Brand (`/brand/portal/*`)
| Route | Result |
|-------|--------|
| / | PASS (slow; cart 400 / dashboard API 404) |
| products / distributors / analytics / team / settings | PASS |

### Admin (`/admin/*`)
| Route | Result |
|-------|--------|
| Most list pages | PASS |
| settings (commission) | PASS (`defaultCommissionPct: 10`) |
| vendors/:disposableId | PASS |
| brand-distributor-invites | **P4-001** UI → dashboard |
| logout → auth/me | PASS 401 |

---

## Recommended fix priority (for follow-up; not done in this audit)

1. **P2-001 / P2-002** — Mark verified/live vendors `wizardComplete` (or skip gate for verified); do not redirect catalog/settings routes to setup.  
2. **P2-003 / P3-001** — Gate cart provider by role (customer-only).  
3. **P4-001** — Fix admin invites page routing (API already works).  
4. **P3-002 / P4-002 / P2-005** — Align API paths with UI or remove dead 404 calls.

---

*End of P2–P4 audit findings.*

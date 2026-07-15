# Playwright P0 Crawl Report — HoReCa Hub

**Date:** 2026-07-15T17:58:08.927Z
**Base URL:** http://localhost:3000
**Routes crawled:** 80
**Findings:** 180 (Critical 0, High 41, Medium 139, Low 0)

## Route summary

| Route | Status | Notes |
|-------|--------|-------|
| `/` | PASS | 2 finding(s) |
| `/login` | PASS | 1 finding(s) |
| `/register` | FAIL | 5 finding(s) |
| `/register?role=customer` | PASS | 1 finding(s) |
| `/vendor/register` | PASS | clean |
| `/brand/register` | PASS | 2 finding(s) |
| `/vendors` | PASS | 2 finding(s) |
| `/brands` | FAIL | 3 finding(s) |
| `/search` | PASS | 1 finding(s) |
| `/search?q=rice` | FAIL | 4 finding(s) |
| `/cart` | PASS | 1 finding(s) |
| `/checkout` | FAIL | 4 finding(s) |
| `/orders` | PASS | 1 finding(s) |
| `/order-lists` | PASS | 1 finding(s) |
| `/order-lists/reorder` | PASS | 1 finding(s) |
| `/order-success` | PASS | 2 finding(s) |
| `/profile` | FAIL | 5 finding(s) |
| `/profile/team` | PASS | 2 finding(s) |
| `/wallet` | PASS | 1 finding(s) |
| `/rewards` | PASS | 2 finding(s) |
| `/continue-ordering` | PASS | 2 finding(s) |
| `/wishlist` | PASS | 2 finding(s) |
| `/under-construction` | PASS | 1 finding(s) |
| `/sentry-example-page` | PASS | 1 finding(s) |
| `/category/grocery` | PASS | 1 finding(s) |
| `/product/nonexistent-id` | PASS | 1 finding(s) |
| `/product/_legacy-test` | FAIL | 5 finding(s) |
| `/vendor/nonexistent-slug` | FAIL | 5 finding(s) |
| `/brand/nonexistent-slug` | FAIL | 4 finding(s) |
| `/recently-viewed/nonexistent` | FAIL | 4 finding(s) |
| `/admin/dashboard` | FAIL | 5 finding(s) |
| `/admin/vendors` | FAIL | 5 finding(s) |
| `/admin/orders` | PASS | 2 finding(s) |
| `/admin/products` | PASS | 2 finding(s) |
| `/admin/customers` | PASS | 2 finding(s) |
| `/admin/brands` | PASS | 2 finding(s) |
| `/admin/categories` | PASS | 2 finding(s) |
| `/admin/approvals` | PASS | 2 finding(s) |
| `/admin/returns` | PASS | 2 finding(s) |
| `/admin/finance` | PASS | 2 finding(s) |
| `/admin/reports` | PASS | 1 finding(s) |
| `/admin/settings` | PASS | 2 finding(s) |
| `/admin/team` | FAIL | 4 finding(s) |
| `/admin/credit` | PASS | 2 finding(s) |
| `/admin/ledger` | PASS | 2 finding(s) |
| `/admin/claims` | PASS | 2 finding(s) |
| `/admin/promotions` | PASS | 2 finding(s) |
| `/admin/audit-logs` | PASS | 2 finding(s) |
| `/admin/brand-distributor-invites` | PASS | 2 finding(s) |
| `/vendor/dashboard` | PASS | 1 finding(s) |
| `/vendor/products` | PASS | 1 finding(s) |
| `/vendor/orders` | FAIL | 5 finding(s) |
| `/vendor/inventory` | PASS | 1 finding(s) |
| `/vendor/warehouse` | PASS | 2 finding(s) |
| `/vendor/settings` | PASS | 2 finding(s) |
| `/vendor/team` | PASS | 2 finding(s) |
| `/vendor/wallet` | PASS | 2 finding(s) |
| `/vendor/credit` | PASS | 2 finding(s) |
| `/vendor/ledger` | PASS | 2 finding(s) |
| `/vendor/reports` | FAIL | 5 finding(s) |
| `/vendor/returns` | PASS | 2 finding(s) |
| `/vendor/claims` | PASS | 1 finding(s) |
| `/vendor/customers` | PASS | 2 finding(s) |
| `/vendor/customer-groups` | FAIL | 3 finding(s) |
| `/vendor/collections` | PASS | 2 finding(s) |
| `/vendor/promotions` | PASS | 2 finding(s) |
| `/vendor/price-lists` | PASS | 1 finding(s) |
| `/vendor/price-lists/workspace` | PASS | 1 finding(s) |
| `/vendor/brand-mappings` | PASS | 1 finding(s) |
| `/vendor/sales-team` | PASS | 2 finding(s) |
| `/vendor/outlets` | FAIL | 5 finding(s) |
| `/vendor/account` | PASS | 2 finding(s) |
| `/vendor/notifications` | PASS | 2 finding(s) |
| `/vendor/setup` | PASS | 2 finding(s) |
| `/brand/portal` | PASS | 2 finding(s) |
| `/brand/portal/products` | PASS | 2 finding(s) |
| `/brand/portal/settings` | PASS | 2 finding(s) |
| `/brand/portal/team` | PASS | 2 finding(s) |
| `/brand/portal/analytics` | PASS | 2 finding(s) |
| `/brand/portal/distributors` | FAIL | 5 finding(s) |

## Findings

### High

#### P0-001 — Console error

- **Severity:** High
- **Route:** `/register`
- **Steps:** 1. Open /register / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-002 — Console error

- **Severity:** High
- **Route:** `/register`
- **Steps:** 1. Open /register / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-003 — Console error

- **Severity:** High
- **Route:** `/register`
- **Steps:** 1. Open /register / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-004 — Console error

- **Severity:** High
- **Route:** `/brands`
- **Steps:** 1. Open /brands / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Failed to load vendors: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at VendorsPage[useEffect()] (http://localhost:3000/_next/stati
- **Suggested fix:** Fix client exception

#### P0-005 — Console error

- **Severity:** High
- **Route:** `/search?q=rice`
- **Steps:** 1. Open /search?q=rice / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-006 — Console error

- **Severity:** High
- **Route:** `/search?q=rice`
- **Steps:** 1. Open /search?q=rice / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-007 — Console error

- **Severity:** High
- **Route:** `/checkout`
- **Steps:** 1. Open /checkout / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-008 — Console error

- **Severity:** High
- **Route:** `/checkout`
- **Steps:** 1. Open /checkout / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-009 — Console error

- **Severity:** High
- **Route:** `/profile`
- **Steps:** 1. Open /profile / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-010 — Console error

- **Severity:** High
- **Route:** `/profile`
- **Steps:** 1. Open /profile / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-011 — Console error

- **Severity:** High
- **Route:** `/profile`
- **Steps:** 1. Open /profile / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-012 — Console error

- **Severity:** High
- **Route:** `/product/_legacy-test`
- **Steps:** 1. Open /product/_legacy-test / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-013 — Console error

- **Severity:** High
- **Route:** `/product/_legacy-test`
- **Steps:** 1. Open /product/_legacy-test / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-014 — Console error

- **Severity:** High
- **Route:** `/product/_legacy-test`
- **Steps:** 1. Open /product/_legacy-test / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-015 — Console error

- **Severity:** High
- **Route:** `/vendor/nonexistent-slug`
- **Steps:** 1. Open /vendor/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-016 — Console error

- **Severity:** High
- **Route:** `/vendor/nonexistent-slug`
- **Steps:** 1. Open /vendor/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-017 — Console error

- **Severity:** High
- **Route:** `/vendor/nonexistent-slug`
- **Steps:** 1. Open /vendor/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-018 — Console error

- **Severity:** High
- **Route:** `/brand/nonexistent-slug`
- **Steps:** 1. Open /brand/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.getById (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:638:32)
    at VendorStorePage.useEffect (http://localhost:3000/_next/static/chunks/src_0227fee
- **Suggested fix:** Fix client exception

#### P0-019 — Console error

- **Severity:** High
- **Route:** `/recently-viewed/nonexistent`
- **Steps:** 1. Open /recently-viewed/nonexistent / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-020 — Console error

- **Severity:** High
- **Route:** `/recently-viewed/nonexistent`
- **Steps:** 1. Open /recently-viewed/nonexistent / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-021 — Console error

- **Severity:** High
- **Route:** `/admin/dashboard`
- **Steps:** 1. Open /admin/dashboard / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-022 — Console error

- **Severity:** High
- **Route:** `/admin/dashboard`
- **Steps:** 1. Open /admin/dashboard / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-023 — Console error

- **Severity:** High
- **Route:** `/admin/dashboard`
- **Steps:** 1. Open /admin/dashboard / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-024 — Console error

- **Severity:** High
- **Route:** `/admin/vendors`
- **Steps:** 1. Open /admin/vendors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-025 — Console error

- **Severity:** High
- **Route:** `/admin/vendors`
- **Steps:** 1. Open /admin/vendors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-026 — Console error

- **Severity:** High
- **Route:** `/admin/vendors`
- **Steps:** 1. Open /admin/vendors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-027 — Console error

- **Severity:** High
- **Route:** `/admin/team`
- **Steps:** 1. Open /admin/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-028 — Console error

- **Severity:** High
- **Route:** `/admin/team`
- **Steps:** 1. Open /admin/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-029 — Console error

- **Severity:** High
- **Route:** `/vendor/orders`
- **Steps:** 1. Open /vendor/orders / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-030 — Console error

- **Severity:** High
- **Route:** `/vendor/orders`
- **Steps:** 1. Open /vendor/orders / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-031 — Console error

- **Severity:** High
- **Route:** `/vendor/orders`
- **Steps:** 1. Open /vendor/orders / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-032 — Console error

- **Severity:** High
- **Route:** `/vendor/reports`
- **Steps:** 1. Open /vendor/reports / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-033 — Console error

- **Severity:** High
- **Route:** `/vendor/reports`
- **Steps:** 1. Open /vendor/reports / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-034 — Console error

- **Severity:** High
- **Route:** `/vendor/reports`
- **Steps:** 1. Open /vendor/reports / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-035 — Console error

- **Severity:** High
- **Route:** `/vendor/customer-groups`
- **Steps:** 1. Open /vendor/customer-groups / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-036 — Console error

- **Severity:** High
- **Route:** `/vendor/outlets`
- **Steps:** 1. Open /vendor/outlets / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-037 — Console error

- **Severity:** High
- **Route:** `/vendor/outlets`
- **Steps:** 1. Open /vendor/outlets / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-038 — Console error

- **Severity:** High
- **Route:** `/vendor/outlets`
- **Steps:** 1. Open /vendor/outlets / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

#### P0-039 — Console error

- **Severity:** High
- **Route:** `/brand/portal/distributors`
- **Steps:** 1. Open /brand/portal/distributors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Google Maps failed to load: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at GoogleMapsProvider.useEffect.loadMaps (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3153:43)
    at GoogleMapsProvider.useEffect (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:3186:13)
    at Object.
- **Suggested fix:** Fix client exception

#### P0-040 — Console error

- **Severity:** High
- **Route:** `/brand/portal/distributors`
- **Steps:** 1. Open /brand/portal/distributors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** [Navbar] Failed to load categories: TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:661:32)
    at Navbar[useEffect()] (http://localhost:3000/_nex
- **Suggested fix:** Fix client exception

#### P0-041 — Console error

- **Severity:** High
- **Route:** `/brand/portal/distributors`
- **Steps:** 1. Open /brand/portal/distributors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** TypeError: Failed to fetch
    at http://localhost:3000/_next/static/chunks/node_modules_%40sentry_core_build_esm_5d0f655a._.js:10416:34
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:388:23)
    at Object.list (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:631:32)
    at MobileSearchOverlay[useEffect()] (http://localhost:3000/_next/static/chunks/src_2b9
- **Suggested fix:** Fix client exception

### Medium

#### P0-042 — Broken image

- **Severity:** Medium
- **Route:** `/`
- **Steps:** 1. Open /
- **Expected:** Images load
- **Actual:** Broken: http://localhost:3000/_next/image?url=%2Fimages%2Fmobile-hero-right.png&w=2048&q=75
- **Suggested fix:** Fix image URL or add fallback

#### P0-043 — 8 unnamed button(s)

- **Severity:** Medium
- **Route:** `/`
- **Steps:** 1. Open /
- **Expected:** Buttons have accessible name
- **Actual:** 8 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-044 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/login`
- **Steps:** 1. Open /login
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-045 — Console error

- **Severity:** Medium
- **Route:** `/register`
- **Steps:** 1. Open /register / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-046 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/register`
- **Steps:** 1. Open /register
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-047 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/register?role=customer`
- **Steps:** 1. Open /register?role=customer
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-048 — Console error

- **Severity:** Medium
- **Route:** `/brand/register`
- **Steps:** 1. Open /brand/register / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-049 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/register`
- **Steps:** 1. Open /brand/register
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-050 — Console error

- **Severity:** Medium
- **Route:** `/vendors`
- **Steps:** 1. Open /vendors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-051 — 5 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendors`
- **Steps:** 1. Open /vendors
- **Expected:** Buttons have accessible name
- **Actual:** 5 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-052 — Console error

- **Severity:** Medium
- **Route:** `/brands`
- **Steps:** 1. Open /brands / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-053 — 5 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brands`
- **Steps:** 1. Open /brands
- **Expected:** Buttons have accessible name
- **Actual:** 5 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-054 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/search`
- **Steps:** 1. Open /search
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-055 — Console error

- **Severity:** Medium
- **Route:** `/search?q=rice`
- **Steps:** 1. Open /search?q=rice / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-056 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/search?q=rice`
- **Steps:** 1. Open /search?q=rice
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-057 — 2 unnamed button(s)

- **Severity:** Medium
- **Route:** `/cart`
- **Steps:** 1. Open /cart
- **Expected:** Buttons have accessible name
- **Actual:** 2 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-058 — Console error

- **Severity:** Medium
- **Route:** `/checkout`
- **Steps:** 1. Open /checkout / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-059 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/checkout`
- **Steps:** 1. Open /checkout
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-060 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/orders`
- **Steps:** 1. Open /orders
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-061 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/order-lists`
- **Steps:** 1. Open /order-lists
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-062 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/order-lists/reorder`
- **Steps:** 1. Open /order-lists/reorder
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-063 — Console error

- **Severity:** Medium
- **Route:** `/order-success`
- **Steps:** 1. Open /order-success / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-064 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/order-success`
- **Steps:** 1. Open /order-success
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-065 — Console error

- **Severity:** Medium
- **Route:** `/profile`
- **Steps:** 1. Open /profile / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-066 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/profile`
- **Steps:** 1. Open /profile
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-067 — Console error

- **Severity:** Medium
- **Route:** `/profile/team`
- **Steps:** 1. Open /profile/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-068 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/profile/team`
- **Steps:** 1. Open /profile/team
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-069 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/wallet`
- **Steps:** 1. Open /wallet
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-070 — Console error

- **Severity:** Medium
- **Route:** `/rewards`
- **Steps:** 1. Open /rewards / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-071 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/rewards`
- **Steps:** 1. Open /rewards
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-072 — Console error

- **Severity:** Medium
- **Route:** `/continue-ordering`
- **Steps:** 1. Open /continue-ordering / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-073 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/continue-ordering`
- **Steps:** 1. Open /continue-ordering
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-074 — Console error

- **Severity:** Medium
- **Route:** `/wishlist`
- **Steps:** 1. Open /wishlist / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Failed to load resource: the server responded with a status of 404 (Not Found)
- **Suggested fix:** Fix client exception

#### P0-075 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/wishlist`
- **Steps:** 1. Open /wishlist
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-076 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/under-construction`
- **Steps:** 1. Open /under-construction
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-077 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/sentry-example-page`
- **Steps:** 1. Open /sentry-example-page
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-078 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/category/grocery`
- **Steps:** 1. Open /category/grocery
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-079 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/product/nonexistent-id`
- **Steps:** 1. Open /product/nonexistent-id
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-080 — Console error

- **Severity:** Medium
- **Route:** `/product/_legacy-test`
- **Steps:** 1. Open /product/_legacy-test / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-081 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/product/_legacy-test`
- **Steps:** 1. Open /product/_legacy-test
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-082 — Console error

- **Severity:** Medium
- **Route:** `/vendor/nonexistent-slug`
- **Steps:** 1. Open /vendor/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-083 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/nonexistent-slug`
- **Steps:** 1. Open /vendor/nonexistent-slug
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-084 — Console error

- **Severity:** Medium
- **Route:** `/brand/nonexistent-slug`
- **Steps:** 1. Open /brand/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Failed to load resource: the server responded with a status of 404 (Not Found)
- **Suggested fix:** Fix client exception

#### P0-085 — Console error

- **Severity:** Medium
- **Route:** `/brand/nonexistent-slug`
- **Steps:** 1. Open /brand/nonexistent-slug / 2. DevTools console
- **Expected:** No console errors
- **Actual:** Error: Vendor not found
    at apiFetch (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:402:15)
    at async Object.getProducts (http://localhost:3000/_next/static/chunks/src_2b9b4f47._.js:649:26)
    at async Promise.allSettled (index 1)
- **Suggested fix:** Fix client exception

#### P0-086 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/nonexistent-slug`
- **Steps:** 1. Open /brand/nonexistent-slug
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-087 — Console error

- **Severity:** Medium
- **Route:** `/recently-viewed/nonexistent`
- **Steps:** 1. Open /recently-viewed/nonexistent / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-088 — 2 unnamed button(s)

- **Severity:** Medium
- **Route:** `/recently-viewed/nonexistent`
- **Steps:** 1. Open /recently-viewed/nonexistent
- **Expected:** Buttons have accessible name
- **Actual:** 2 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-089 — Console error

- **Severity:** Medium
- **Route:** `/admin/dashboard`
- **Steps:** 1. Open /admin/dashboard / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-090 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/dashboard`
- **Steps:** 1. Open /admin/dashboard
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-091 — Console error

- **Severity:** Medium
- **Route:** `/admin/vendors`
- **Steps:** 1. Open /admin/vendors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-092 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/vendors`
- **Steps:** 1. Open /admin/vendors
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-093 — Console error

- **Severity:** Medium
- **Route:** `/admin/orders`
- **Steps:** 1. Open /admin/orders / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-094 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/orders`
- **Steps:** 1. Open /admin/orders
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-095 — Console error

- **Severity:** Medium
- **Route:** `/admin/products`
- **Steps:** 1. Open /admin/products / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-096 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/products`
- **Steps:** 1. Open /admin/products
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-097 — Console error

- **Severity:** Medium
- **Route:** `/admin/customers`
- **Steps:** 1. Open /admin/customers / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-098 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/customers`
- **Steps:** 1. Open /admin/customers
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-099 — Console error

- **Severity:** Medium
- **Route:** `/admin/brands`
- **Steps:** 1. Open /admin/brands / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-100 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/brands`
- **Steps:** 1. Open /admin/brands
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-101 — Console error

- **Severity:** Medium
- **Route:** `/admin/categories`
- **Steps:** 1. Open /admin/categories / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-102 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/categories`
- **Steps:** 1. Open /admin/categories
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-103 — Console error

- **Severity:** Medium
- **Route:** `/admin/approvals`
- **Steps:** 1. Open /admin/approvals / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-104 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/approvals`
- **Steps:** 1. Open /admin/approvals
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-105 — Console error

- **Severity:** Medium
- **Route:** `/admin/returns`
- **Steps:** 1. Open /admin/returns / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-106 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/returns`
- **Steps:** 1. Open /admin/returns
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-107 — Console error

- **Severity:** Medium
- **Route:** `/admin/finance`
- **Steps:** 1. Open /admin/finance / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-108 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/finance`
- **Steps:** 1. Open /admin/finance
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-109 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/reports`
- **Steps:** 1. Open /admin/reports
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-110 — Console error

- **Severity:** Medium
- **Route:** `/admin/settings`
- **Steps:** 1. Open /admin/settings / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-111 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/settings`
- **Steps:** 1. Open /admin/settings
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-112 — Console error

- **Severity:** Medium
- **Route:** `/admin/team`
- **Steps:** 1. Open /admin/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-113 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/team`
- **Steps:** 1. Open /admin/team
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-114 — Console error

- **Severity:** Medium
- **Route:** `/admin/credit`
- **Steps:** 1. Open /admin/credit / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-115 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/credit`
- **Steps:** 1. Open /admin/credit
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-116 — Console error

- **Severity:** Medium
- **Route:** `/admin/ledger`
- **Steps:** 1. Open /admin/ledger / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-117 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/ledger`
- **Steps:** 1. Open /admin/ledger
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-118 — Console error

- **Severity:** Medium
- **Route:** `/admin/claims`
- **Steps:** 1. Open /admin/claims / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-119 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/claims`
- **Steps:** 1. Open /admin/claims
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-120 — Console error

- **Severity:** Medium
- **Route:** `/admin/promotions`
- **Steps:** 1. Open /admin/promotions / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-121 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/promotions`
- **Steps:** 1. Open /admin/promotions
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-122 — Console error

- **Severity:** Medium
- **Route:** `/admin/audit-logs`
- **Steps:** 1. Open /admin/audit-logs / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-123 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/audit-logs`
- **Steps:** 1. Open /admin/audit-logs
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-124 — Console error

- **Severity:** Medium
- **Route:** `/admin/brand-distributor-invites`
- **Steps:** 1. Open /admin/brand-distributor-invites / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-125 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/admin/brand-distributor-invites`
- **Steps:** 1. Open /admin/brand-distributor-invites
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-126 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/dashboard`
- **Steps:** 1. Open /vendor/dashboard
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-127 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/products`
- **Steps:** 1. Open /vendor/products
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-128 — Console error

- **Severity:** Medium
- **Route:** `/vendor/orders`
- **Steps:** 1. Open /vendor/orders / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-129 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/orders`
- **Steps:** 1. Open /vendor/orders
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-130 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/inventory`
- **Steps:** 1. Open /vendor/inventory
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-131 — Console error

- **Severity:** Medium
- **Route:** `/vendor/warehouse`
- **Steps:** 1. Open /vendor/warehouse / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-132 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/warehouse`
- **Steps:** 1. Open /vendor/warehouse
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-133 — Console error

- **Severity:** Medium
- **Route:** `/vendor/settings`
- **Steps:** 1. Open /vendor/settings / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-134 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/settings`
- **Steps:** 1. Open /vendor/settings
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-135 — Console error

- **Severity:** Medium
- **Route:** `/vendor/team`
- **Steps:** 1. Open /vendor/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-136 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/team`
- **Steps:** 1. Open /vendor/team
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-137 — Console error

- **Severity:** Medium
- **Route:** `/vendor/wallet`
- **Steps:** 1. Open /vendor/wallet / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-138 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/wallet`
- **Steps:** 1. Open /vendor/wallet
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-139 — Console error

- **Severity:** Medium
- **Route:** `/vendor/credit`
- **Steps:** 1. Open /vendor/credit / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-140 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/credit`
- **Steps:** 1. Open /vendor/credit
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-141 — Console error

- **Severity:** Medium
- **Route:** `/vendor/ledger`
- **Steps:** 1. Open /vendor/ledger / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-142 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/ledger`
- **Steps:** 1. Open /vendor/ledger
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-143 — Console error

- **Severity:** Medium
- **Route:** `/vendor/reports`
- **Steps:** 1. Open /vendor/reports / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-144 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/reports`
- **Steps:** 1. Open /vendor/reports
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-145 — Console error

- **Severity:** Medium
- **Route:** `/vendor/returns`
- **Steps:** 1. Open /vendor/returns / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-146 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/returns`
- **Steps:** 1. Open /vendor/returns
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-147 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/claims`
- **Steps:** 1. Open /vendor/claims
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-148 — Console error

- **Severity:** Medium
- **Route:** `/vendor/customers`
- **Steps:** 1. Open /vendor/customers / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-149 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/customers`
- **Steps:** 1. Open /vendor/customers
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-150 — Console error

- **Severity:** Medium
- **Route:** `/vendor/customer-groups`
- **Steps:** 1. Open /vendor/customer-groups / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-151 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/customer-groups`
- **Steps:** 1. Open /vendor/customer-groups
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-152 — Console error

- **Severity:** Medium
- **Route:** `/vendor/collections`
- **Steps:** 1. Open /vendor/collections / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-153 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/collections`
- **Steps:** 1. Open /vendor/collections
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-154 — Console error

- **Severity:** Medium
- **Route:** `/vendor/promotions`
- **Steps:** 1. Open /vendor/promotions / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-155 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/promotions`
- **Steps:** 1. Open /vendor/promotions
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-156 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/price-lists`
- **Steps:** 1. Open /vendor/price-lists
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-157 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/price-lists/workspace`
- **Steps:** 1. Open /vendor/price-lists/workspace
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-158 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/brand-mappings`
- **Steps:** 1. Open /vendor/brand-mappings
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-159 — Console error

- **Severity:** Medium
- **Route:** `/vendor/sales-team`
- **Steps:** 1. Open /vendor/sales-team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-160 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/sales-team`
- **Steps:** 1. Open /vendor/sales-team
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-161 — Console error

- **Severity:** Medium
- **Route:** `/vendor/outlets`
- **Steps:** 1. Open /vendor/outlets / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-162 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/outlets`
- **Steps:** 1. Open /vendor/outlets
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-163 — Console error

- **Severity:** Medium
- **Route:** `/vendor/account`
- **Steps:** 1. Open /vendor/account / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-164 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/account`
- **Steps:** 1. Open /vendor/account
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-165 — Console error

- **Severity:** Medium
- **Route:** `/vendor/notifications`
- **Steps:** 1. Open /vendor/notifications / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-166 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/notifications`
- **Steps:** 1. Open /vendor/notifications
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-167 — Console error

- **Severity:** Medium
- **Route:** `/vendor/setup`
- **Steps:** 1. Open /vendor/setup / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-168 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/vendor/setup`
- **Steps:** 1. Open /vendor/setup
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-169 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal`
- **Steps:** 1. Open /brand/portal / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-170 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal`
- **Steps:** 1. Open /brand/portal
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-171 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal/products`
- **Steps:** 1. Open /brand/portal/products / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-172 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal/products`
- **Steps:** 1. Open /brand/portal/products
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-173 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal/settings`
- **Steps:** 1. Open /brand/portal/settings / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-174 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal/settings`
- **Steps:** 1. Open /brand/portal/settings
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-175 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal/team`
- **Steps:** 1. Open /brand/portal/team / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-176 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal/team`
- **Steps:** 1. Open /brand/portal/team
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-177 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal/analytics`
- **Steps:** 1. Open /brand/portal/analytics / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-178 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal/analytics`
- **Steps:** 1. Open /brand/portal/analytics
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

#### P0-179 — Console error

- **Severity:** Medium
- **Route:** `/brand/portal/distributors`
- **Steps:** 1. Open /brand/portal/distributors / 2. DevTools console
- **Expected:** No console errors
- **Actual:** ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror
    at fetchData (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10156:22)
    at async getSession (http://localhost:3000/_next/static/chunks/node_modules_0ce14591._.js:10323:21)
    at async SessionProvider.useEffect [as _getSession] (http://localhost:3000/_next/static/chunks/node_modules_0ce
- **Suggested fix:** Fix client exception

#### P0-180 — 4 unnamed button(s)

- **Severity:** Medium
- **Route:** `/brand/portal/distributors`
- **Steps:** 1. Open /brand/portal/distributors
- **Expected:** Buttons have accessible name
- **Actual:** 4 unnamed
- **Suggested fix:** Add text or aria-label

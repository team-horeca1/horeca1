# AUDIT_INVENTORY.md — HoReCa Hub QA Test Map

**Generated:** 2026-07-15  
**Scope:** read-only inventory of pages, APIs, overlays, workflows, permissions  
**Sources:** `src/app/**/page.tsx`, `src/app/api/**/route.ts`, `src/components/**/*{Overlay,Modal,Drawer,Dialog}*`, `src/lib/permissions/*`, `src/proxy.ts`  
**Pack taxonomy:** Full App Audit plan (P0–P9).

---

## 0. Pack legend (P0–P9)

| Pack | Focus |
|------|-------|
| **P0** | Automated crawl (all routes × viewport smoke) |
| **P1** | Customer storefront & account |
| **P2** | Vendor portal |
| **P3** | Brand portal |
| **P4** | Admin portal |
| **P5** | RBAC / tenancy / impersonation / IDOR |
| **P6** | API matrix |
| **P7** | Security |
| **P8** | UX / a11y / responsive |
| **P9** | Performance |

**Auth edge gate (`src/proxy.ts`):**
- Customer protected prefixes: `/checkout`, `/orders`, `/order-lists`, `/profile`, `/account` → redirect `/login?redirect=…`
- Admin: `/admin/*` → JWT + `role === admin`
- Brand portal: `/brand/portal/*` → brand | admin | `activeBusinessAccountType.isBrand`
- Vendor portal segments (dashboard, orders, products, …): vendor | admin | `isVendor`
- Public: `/`, `/login`, `/register`, `/vendor/register`, `/brand/register`, `/vendor/[id]` storefront, catalog, cart, search
- Granular RBAC: `PortalPageGuard` + `routePermissions.ts` / `portalNav.ts` `requiredPerm`

---

## 1. Page inventory

**Total:** 91 `page.tsx` files

| ID | URL pattern | File | Actor | Auth gate | Pack |
|----|-------------|------|-------|-----------|------|
| INV-PAGE-001 | `/account/[id]/outlets` | `src/app/account/[id]/outlets/page.tsx` | account | proxy CUSTOMER_PROTECTED; tab RequirePermission | P1 |
| INV-PAGE-002 | `/account/[id]` | `src/app/account/[id]/page.tsx` | account | proxy CUSTOMER_PROTECTED; tab RequirePermission | P1 |
| INV-PAGE-003 | `/account/[id]/roles` | `src/app/account/[id]/roles/page.tsx` | account | proxy CUSTOMER_PROTECTED; tab RequirePermission | P1 |
| INV-PAGE-004 | `/account/[id]/users` | `src/app/account/[id]/users/page.tsx` | account | proxy CUSTOMER_PROTECTED; tab RequirePermission | P1 |
| INV-PAGE-005 | `/admin/approvals` | `src/app/admin/approvals/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-006 | `/admin/audit-logs` | `src/app/admin/audit-logs/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-007 | `/admin/brand-distributor-invites` | `src/app/admin/brand-distributor-invites/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-008 | `/admin/brands/[id]` | `src/app/admin/brands/[id]/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-009 | `/admin/brands` | `src/app/admin/brands/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-010 | `/admin/categories` | `src/app/admin/categories/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-011 | `/admin/claims` | `src/app/admin/claims/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-012 | `/admin/credit` | `src/app/admin/credit/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-013 | `/admin/customers/[id]` | `src/app/admin/customers/[id]/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-014 | `/admin/customers` | `src/app/admin/customers/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-015 | `/admin/dashboard` | `src/app/admin/dashboard/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-016 | `/admin/finance` | `src/app/admin/finance/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-017 | `/admin/ledger` | `src/app/admin/ledger/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-018 | `/admin/orders/[id]` | `src/app/admin/orders/[id]/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-019 | `/admin/orders` | `src/app/admin/orders/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-020 | `/admin/products` | `src/app/admin/products/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-021 | `/admin/promotions` | `src/app/admin/promotions/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-022 | `/admin/reports` | `src/app/admin/reports/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-023 | `/admin/returns` | `src/app/admin/returns/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-024 | `/admin/settings` | `src/app/admin/settings/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-025 | `/admin/team` | `src/app/admin/team/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-026 | `/admin/vendors/[id]` | `src/app/admin/vendors/[id]/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-027 | `/admin/vendors` | `src/app/admin/vendors/page.tsx` | admin | proxy `/admin` → role=admin; PortalPageGuard + routePermissions | P4 |
| INV-PAGE-028 | `/brand/[brandId]` | `src/app/brand/[brandId]/page.tsx` | public | public brand storefront | P1 |
| INV-PAGE-029 | `/brand/portal/analytics` | `src/app/brand/portal/analytics/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-030 | `/brand/portal/distributors` | `src/app/brand/portal/distributors/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-031 | `/brand/portal` | `src/app/brand/portal/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-032 | `/brand/portal/products` | `src/app/brand/portal/products/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-033 | `/brand/portal/settings` | `src/app/brand/portal/settings/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-034 | `/brand/portal/team` | `src/app/brand/portal/team/page.tsx` | brand | proxy `/brand/portal` → brand|admin|activeBrand; PortalPageGuard | P3 |
| INV-PAGE-035 | `/brand/register` | `src/app/brand/register/page.tsx` | public | public onboarding (OTP) | P3 |
| INV-PAGE-036 | `/brands` | `src/app/brands/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-037 | `/cart` | `src/app/cart/page.tsx` | public | public browse; cart merge on login | P1 |
| INV-PAGE-038 | `/cart/shipment/[id]` | `src/app/cart/shipment/[id]/page.tsx` | public | public browse; cart merge on login | P1 |
| INV-PAGE-039 | `/category/[slug]/[categoryId]` | `src/app/category/[slug]/[categoryId]/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-040 | `/category/[slug]` | `src/app/category/[slug]/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-041 | `/checkout` | `src/app/checkout/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-042 | `/continue-ordering` | `src/app/continue-ordering/page.tsx` | customer | post-checkout UX; soft auth expected | P1 |
| INV-PAGE-043 | `/login` | `src/app/login/page.tsx` | public | public auth | P1 |
| INV-PAGE-044 | `/order-lists/[id]` | `src/app/order-lists/[id]/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-045 | `/order-lists` | `src/app/order-lists/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-046 | `/order-lists/reorder` | `src/app/order-lists/reorder/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-047 | `/order-success` | `src/app/order-success/page.tsx` | customer | post-checkout UX; soft auth expected | P1 |
| INV-PAGE-048 | `/orders/[id]` | `src/app/orders/[id]/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-049 | `/orders` | `src/app/orders/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-050 | `/` | `src/app/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-051 | `/product/[id]` | `src/app/product/[id]/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-052 | `/product/_[id]` | `src/app/product/_[id]/page.tsx` | public | legacy/underscore dynamic — verify dead vs redirect | P0 |
| INV-PAGE-053 | `/profile` | `src/app/profile/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-054 | `/profile/team` | `src/app/profile/team/page.tsx` | customer | proxy CUSTOMER_PROTECTED → `/login?redirect=` | P1 |
| INV-PAGE-055 | `/recently-viewed/[vendorId]` | `src/app/recently-viewed/[vendorId]/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-056 | `/register` | `src/app/register/page.tsx` | public | public auth | P1 |
| INV-PAGE-057 | `/rewards` | `src/app/rewards/page.tsx` | customer | not in proxy CUSTOMER_PROTECTED; soft client auth | P1 |
| INV-PAGE-058 | `/search` | `src/app/search/page.tsx` | public | public marketplace | P1 |
| INV-PAGE-059 | `/sentry-example-page` | `src/app/sentry-example-page/page.tsx` | public | Sentry sample — exclude from prod product claims | P0 |
| INV-PAGE-060 | `/under-construction` | `src/app/under-construction/page.tsx` | public | placeholder | P0 |
| INV-PAGE-061 | `/vendor/account` | `src/app/vendor/(dashboard)/account/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-062 | `/vendor/brand-mappings` | `src/app/vendor/(dashboard)/brand-mappings/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-063 | `/vendor/claims` | `src/app/vendor/(dashboard)/claims/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-064 | `/vendor/collections` | `src/app/vendor/(dashboard)/collections/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-065 | `/vendor/credit` | `src/app/vendor/(dashboard)/credit/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-066 | `/vendor/customer-groups` | `src/app/vendor/(dashboard)/customer-groups/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-067 | `/vendor/customers` | `src/app/vendor/(dashboard)/customers/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-068 | `/vendor/dashboard` | `src/app/vendor/(dashboard)/dashboard/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-069 | `/vendor/inventory` | `src/app/vendor/(dashboard)/inventory/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-070 | `/vendor/ledger` | `src/app/vendor/(dashboard)/ledger/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-071 | `/vendor/notifications` | `src/app/vendor/(dashboard)/notifications/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-072 | `/vendor/orders/[id]` | `src/app/vendor/(dashboard)/orders/[id]/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-073 | `/vendor/orders` | `src/app/vendor/(dashboard)/orders/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-074 | `/vendor/outlets` | `src/app/vendor/(dashboard)/outlets/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-075 | `/vendor/price-lists/[id]` | `src/app/vendor/(dashboard)/price-lists/[id]/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-076 | `/vendor/price-lists` | `src/app/vendor/(dashboard)/price-lists/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-077 | `/vendor/price-lists/workspace` | `src/app/vendor/(dashboard)/price-lists/workspace/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-078 | `/vendor/products` | `src/app/vendor/(dashboard)/products/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-079 | `/vendor/promotions` | `src/app/vendor/(dashboard)/promotions/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-080 | `/vendor/reports` | `src/app/vendor/(dashboard)/reports/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-081 | `/vendor/returns` | `src/app/vendor/(dashboard)/returns/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-082 | `/vendor/sales-team` | `src/app/vendor/(dashboard)/sales-team/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-083 | `/vendor/settings` | `src/app/vendor/(dashboard)/settings/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-084 | `/vendor/team` | `src/app/vendor/(dashboard)/team/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-085 | `/vendor/wallet` | `src/app/vendor/(dashboard)/wallet/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-086 | `/vendor/warehouse` | `src/app/vendor/(dashboard)/warehouse/page.tsx` | vendor | proxy vendor portal; PortalPageGuard + outlet strip | P2 |
| INV-PAGE-087 | `/vendor/[id]` | `src/app/vendor/[id]/page.tsx` | public | public storefront | P1 |
| INV-PAGE-088 | `/vendor/register` | `src/app/vendor/register/page.tsx` | public | public onboarding (OTP) | P2 |
| INV-PAGE-089 | `/vendor/setup` | `src/app/vendor/setup/page.tsx` | vendor | proxy vendor segment; post-register setup | P2 |
| INV-PAGE-090 | `/vendors` | `src/app/vendors/page.tsx` | public | public storefront | P1 |
| INV-PAGE-091 | `/wallet` | `src/app/wallet/page.tsx` | customer | not in proxy list; soft client auth; account scope `creditLine.view` via routePermissions | P1 |

### 1.1 Counts by actor

| Actor | Pages |
|-------|------:|
| account | 4 |
| admin | 23 |
| brand | 6 |
| customer | 12 |
| public | 19 |
| vendor | 27 |

### 1.2 Counts by suggested pack

| Pack | Pages |
|------|------:|
| P0 | 3 |
| P1 | 30 |
| P2 | 28 |
| P3 | 7 |
| P4 | 23 |

> P5–P9 apply cross-cutting to the same pages (RBAC, API, security, UX, perf) rather than owning exclusive page counts.

### 1.3 Notable / special pages

| URL | Note |
|-----|------|
| `/product/_[id]` | Legacy underscore dynamic segment — treat as dead/redirect risk in P0 |
| `/sentry-example-page` | Sentry sample; not a product surface |
| `/under-construction` | Placeholder |
| `/wishlist` | **Removed** (404) — no page file |
| `/vendor/products/new` | No dedicated page (prior E2E 404); create via products UI/modal |
| `/profile/outlets` | No page; outlets under `/account/[id]/outlets` or overlays |

---

## 2. API inventory

**Total route files:** 281

### 2.1 Counts by domain

| Domain | Route files | Primary packs |
|--------|------------:|---------------|
| account | 10 | P1/P5 |
| addresses | 2 | P1 |
| admin | 76 | P4/P5/P6 |
| auth | 12 | P1/P5/P6/P7 |
| brand | 21 | P3/P5 |
| brand-master-products | 1 | P1/P3 |
| brands | 2 | P1 |
| cart | 3 | P1/P6 |
| categories | 2 | P1 |
| checkout | 1 | P1 |
| collections | 1 | P1 |
| config | 1 | P1 |
| credit | 3 | P1 |
| files | 1 | P2/P4 |
| health | 2 | P0/P9 |
| inventory | 1 | P2 |
| lists | 3 | P1 |
| master-products | 1 | P1/P4 |
| me | 2 | P1 |
| notifications | 3 | P1/P2/P5 |
| orders | 8 | P1/P6 |
| payments | 4 | P1/P6/P7 |
| permissions | 1 | P5 |
| products | 3 | P1 |
| promotions | 3 | P1/P4 |
| push | 1 | P1 |
| search | 1 | P1/P9 |
| upload | 1 | P2/P7 |
| vendor | 95 | P2/P5/P6 |
| vendors | 9 | P1 |
| wallet | 7 | P1/P2/P4 |

### 2.2 Complete path × methods

| ID | Path | Methods | Domain | Pack hint |
|----|------|---------|--------|-----------|
| INV-API-001 | `/api/auth/[...nextauth]` | GET,POST | auth | P1 |
| INV-API-002 | `/api/health` | GET | health | P0 |
| INV-API-003 | `/api/v1/account/[id]/become-vendor` | POST | account | P1 |
| INV-API-004 | `/api/v1/account/[id]/outlets/[outletId]` | PATCH,DELETE | account | P1 |
| INV-API-005 | `/api/v1/account/[id]/outlets` | GET,POST | account | P1 |
| INV-API-006 | `/api/v1/account/[id]/roles/[roleId]` | PATCH,DELETE | account | P1 |
| INV-API-007 | `/api/v1/account/[id]/roles` | GET,POST | account | P1 |
| INV-API-008 | `/api/v1/account/[id]/users/[userId]/password` | PATCH | account | P1 |
| INV-API-009 | `/api/v1/account/[id]/users/[userId]` | PATCH,DELETE | account | P1 |
| INV-API-010 | `/api/v1/account/[id]/users` | GET,POST | account | P1 |
| INV-API-011 | `/api/v1/account/[id]` | GET,PATCH,DELETE | account | P1 |
| INV-API-012 | `/api/v1/account` | GET,POST | account | P1 |
| INV-API-013 | `/api/v1/addresses/[id]` | PATCH,DELETE | addresses | P1 |
| INV-API-014 | `/api/v1/addresses` | GET,POST | addresses | P1 |
| INV-API-015 | `/api/v1/admin/approvals/summary` | GET | admin | P4 |
| INV-API-016 | `/api/v1/admin/audit-logs` | GET | admin | P4 |
| INV-API-017 | `/api/v1/admin/brand-distributor-invites` | GET,PATCH | admin | P4 |
| INV-API-018 | `/api/v1/admin/brands/[id]/approve` | POST | admin | P4 |
| INV-API-019 | `/api/v1/admin/brands/[id]/authorized-distributors` | GET,PATCH | admin | P4 |
| INV-API-020 | `/api/v1/admin/brands/[id]/team` | GET | admin | P4 |
| INV-API-021 | `/api/v1/admin/brands/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-022 | `/api/v1/admin/brands/embed-backfill` | POST | admin | P4 |
| INV-API-023 | `/api/v1/admin/brands/quick-add` | POST | admin | P4 |
| INV-API-024 | `/api/v1/admin/brands` | GET,POST | admin | P4 |
| INV-API-025 | `/api/v1/admin/business-accounts/[id]/users` | GET | admin | P4 |
| INV-API-026 | `/api/v1/admin/categories/[id]/approval` | PATCH | admin | P4 |
| INV-API-027 | `/api/v1/admin/categories/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-028 | `/api/v1/admin/categories/export` | GET | admin | P4 |
| INV-API-029 | `/api/v1/admin/categories/import` | POST | admin | P4 |
| INV-API-030 | `/api/v1/admin/categories` | GET,POST | admin | P4 |
| INV-API-031 | `/api/v1/admin/claims/[id]` | PATCH | admin | P4 |
| INV-API-032 | `/api/v1/admin/claims` | GET | admin | P4 |
| INV-API-033 | `/api/v1/admin/credit/assign` | POST | admin | P4 |
| INV-API-034 | `/api/v1/admin/credit/config` | GET,PATCH | admin | P4 |
| INV-API-035 | `/api/v1/admin/credit/cron` | POST | admin | P4 |
| INV-API-036 | `/api/v1/admin/credit` | GET | admin | P4 |
| INV-API-037 | `/api/v1/admin/dashboard` | GET | admin | P4 |
| INV-API-038 | `/api/v1/admin/finance` | GET | admin | P4 |
| INV-API-039 | `/api/v1/admin/impersonate/brand` | POST,DELETE | admin | P4 |
| INV-API-040 | `/api/v1/admin/impersonate/customer` | POST,DELETE | admin | P4 |
| INV-API-041 | `/api/v1/admin/impersonate` | GET,POST,PATCH,DELETE | admin | P4 |
| INV-API-042 | `/api/v1/admin/inventory/bulk` | POST | admin | P4 |
| INV-API-043 | `/api/v1/admin/ledger` | GET | admin | P4 |
| INV-API-044 | `/api/v1/admin/master-products/[id]/approval` | PATCH | admin | P4 |
| INV-API-045 | `/api/v1/admin/master-products/[id]/revert` | POST | admin | P4 |
| INV-API-046 | `/api/v1/admin/master-products/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-047 | `/api/v1/admin/master-products` | GET,POST | admin | P4 |
| INV-API-048 | `/api/v1/admin/orders/[id]/invoice` | GET | admin | P4 |
| INV-API-049 | `/api/v1/admin/orders/[id]/modify` | PATCH | admin | P4 |
| INV-API-050 | `/api/v1/admin/orders/[id]/reassign` | POST | admin | P4 |
| INV-API-051 | `/api/v1/admin/orders/[id]/split` | POST | admin | P4 |
| INV-API-052 | `/api/v1/admin/orders/[id]` | GET,PATCH | admin | P4 |
| INV-API-053 | `/api/v1/admin/orders` | GET | admin | P4 |
| INV-API-054 | `/api/v1/admin/products/[id]/approval` | PATCH | admin | P4 |
| INV-API-055 | `/api/v1/admin/products/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-056 | `/api/v1/admin/products/bulk-update` | PATCH | admin | P4 |
| INV-API-057 | `/api/v1/admin/products/count` | GET | admin | P4 |
| INV-API-058 | `/api/v1/admin/products/export` | GET | admin | P4 |
| INV-API-059 | `/api/v1/admin/products/import` | POST | admin | P4 |
| INV-API-060 | `/api/v1/admin/products` | GET,POST | admin | P4 |
| INV-API-061 | `/api/v1/admin/promotions/cashback/[id]` | PATCH,DELETE | admin | P4 |
| INV-API-062 | `/api/v1/admin/promotions/cashback` | GET,POST | admin | P4 |
| INV-API-063 | `/api/v1/admin/promotions/coupons/[id]` | PATCH,DELETE | admin | P4 |
| INV-API-064 | `/api/v1/admin/promotions/coupons` | GET,POST | admin | P4 |
| INV-API-065 | `/api/v1/admin/promotions/entries/[id]` | PATCH | admin | P4 |
| INV-API-066 | `/api/v1/admin/promotions/entries` | GET | admin | P4 |
| INV-API-067 | `/api/v1/admin/promotions/grant` | POST | admin | P4 |
| INV-API-068 | `/api/v1/admin/reports` | GET | admin | P4 |
| INV-API-069 | `/api/v1/admin/returns/[id]` | PATCH | admin | P4 |
| INV-API-070 | `/api/v1/admin/returns` | GET | admin | P4 |
| INV-API-071 | `/api/v1/admin/roles/[id]` | PATCH,DELETE | admin | P4 |
| INV-API-072 | `/api/v1/admin/roles` | GET,POST | admin | P4 |
| INV-API-073 | `/api/v1/admin/salespersons` | GET | admin | P4 |
| INV-API-074 | `/api/v1/admin/settings` | GET,PATCH | admin | P4 |
| INV-API-075 | `/api/v1/admin/settlements/[id]` | PATCH | admin | P4 |
| INV-API-076 | `/api/v1/admin/settlements/cron` | POST | admin | P4 |
| INV-API-077 | `/api/v1/admin/settlements` | GET,POST | admin | P4 |
| INV-API-078 | `/api/v1/admin/team/[id]/password` | PATCH | admin | P4 |
| INV-API-079 | `/api/v1/admin/team/[id]` | PATCH,DELETE | admin | P4 |
| INV-API-080 | `/api/v1/admin/team` | GET,POST | admin | P4 |
| INV-API-081 | `/api/v1/admin/users/[id]/password` | PATCH | admin | P4 |
| INV-API-082 | `/api/v1/admin/users/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-083 | `/api/v1/admin/users/bulk-update` | POST | admin | P4 |
| INV-API-084 | `/api/v1/admin/users/import` | POST | admin | P4 |
| INV-API-085 | `/api/v1/admin/users` | GET,POST | admin | P4 |
| INV-API-086 | `/api/v1/admin/vendors/[id]/documents/[docId]` | PATCH | admin | P4 |
| INV-API-087 | `/api/v1/admin/vendors/[id]/documents` | GET | admin | P4 |
| INV-API-088 | `/api/v1/admin/vendors/[id]/team` | GET | admin | P4 |
| INV-API-089 | `/api/v1/admin/vendors/[id]` | GET,PATCH,DELETE | admin | P4 |
| INV-API-090 | `/api/v1/admin/vendors` | GET,POST | admin | P4 |
| INV-API-091 | `/api/v1/auth/check-email` | POST | auth | P1 |
| INV-API-092 | `/api/v1/auth/check-phone` | POST | auth | P1 |
| INV-API-093 | `/api/v1/auth/check-vendor` | POST | auth | P1 |
| INV-API-094 | `/api/v1/auth/logout` | POST | auth | P1 |
| INV-API-095 | `/api/v1/auth/me` | GET,PATCH | auth | P1 |
| INV-API-096 | `/api/v1/auth/otp/send` | POST | auth | P1 |
| INV-API-097 | `/api/v1/auth/otp/verify` | POST | auth | P1 |
| INV-API-098 | `/api/v1/auth/session-stale` | GET | auth | P1 |
| INV-API-099 | `/api/v1/auth/signup` | POST | auth | P1 |
| INV-API-100 | `/api/v1/auth/switch-business-account` | POST | auth | P1 |
| INV-API-101 | `/api/v1/auth/switch-outlet` | POST | auth | P1 |
| INV-API-102 | `/api/v1/brand/analytics` | GET | brand | P3 |
| INV-API-103 | `/api/v1/brand/application-status` | GET | brand | P3 |
| INV-API-104 | `/api/v1/brand/authorized-distributors` | GET,POST,PATCH | brand | P3 |
| INV-API-105 | `/api/v1/brand/categories/suggest` | POST | brand | P3 |
| INV-API-106 | `/api/v1/brand/coverage` | GET,POST | brand | P3 |
| INV-API-107 | `/api/v1/brand/distributor-invites` | GET,POST | brand | P3 |
| INV-API-108 | `/api/v1/brand/distributors/create` | POST | brand | P3 |
| INV-API-109 | `/api/v1/brand/mappings/[id]` | PATCH | brand | P3 |
| INV-API-110 | `/api/v1/brand/master-products` | POST | brand | P3 |
| INV-API-111 | `/api/v1/brand/onboarding/submit` | POST | brand | P3 |
| INV-API-112 | `/api/v1/brand/products/[id]` | PATCH,DELETE | brand | P3 |
| INV-API-113 | `/api/v1/brand/products/export` | GET | brand | P3 |
| INV-API-114 | `/api/v1/brand/products/import` | GET,POST | brand | P3 |
| INV-API-115 | `/api/v1/brand/products` | GET,POST | brand | P3 |
| INV-API-116 | `/api/v1/brand/profile` | GET,POST,PATCH | brand | P3 |
| INV-API-117 | `/api/v1/brand/roles/[id]` | PATCH,DELETE | brand | P3 |
| INV-API-118 | `/api/v1/brand/roles` | GET,POST | brand | P3 |
| INV-API-119 | `/api/v1/brand/team/[id]/password` | PATCH | brand | P3 |
| INV-API-120 | `/api/v1/brand/team/[id]` | PATCH,DELETE | brand | P3 |
| INV-API-121 | `/api/v1/brand/team` | GET,POST | brand | P3 |
| INV-API-122 | `/api/v1/brand/vendors/search` | GET | brand | P3 |
| INV-API-123 | `/api/v1/brand-master-products` | GET | brand-master-products | P1 |
| INV-API-124 | `/api/v1/brands/[slug]` | GET | brands | P1 |
| INV-API-125 | `/api/v1/brands` | GET | brands | P1 |
| INV-API-126 | `/api/v1/cart/items/[id]` | PATCH,DELETE | cart | P1 |
| INV-API-127 | `/api/v1/cart/merge` | POST | cart | P1 |
| INV-API-128 | `/api/v1/cart` | GET,POST,DELETE | cart | P1 |
| INV-API-129 | `/api/v1/categories/[id]/vendors` | GET | categories | P1 |
| INV-API-130 | `/api/v1/categories` | GET | categories | P1 |
| INV-API-131 | `/api/v1/checkout/payment-modes` | GET | checkout | P1 |
| INV-API-132 | `/api/v1/collections` | GET | collections | P1 |
| INV-API-133 | `/api/v1/config/maps-key` | GET | config | P1 |
| INV-API-134 | `/api/v1/credit/apply` | POST | credit | P1 |
| INV-API-135 | `/api/v1/credit/check` | GET | credit | P1 |
| INV-API-136 | `/api/v1/credit/signup` | POST | credit | P1 |
| INV-API-137 | `/api/v1/files/vendor-docs/[docId]` | GET | files | P2 |
| INV-API-138 | `/api/v1/health` | GET | health | P0 |
| INV-API-139 | `/api/v1/inventory/[productId]` | GET,PATCH | inventory | P2 |
| INV-API-140 | `/api/v1/lists/[id]/items` | POST,DELETE | lists | P1 |
| INV-API-141 | `/api/v1/lists/[id]` | GET,DELETE | lists | P1 |
| INV-API-142 | `/api/v1/lists` | GET,POST | lists | P1 |
| INV-API-143 | `/api/v1/master-products` | GET | master-products | P1 |
| INV-API-144 | `/api/v1/me/profile` | GET,POST | me | P1 |
| INV-API-145 | `/api/v1/me` | DELETE | me | P1 |
| INV-API-146 | `/api/v1/notifications/read` | POST | notifications | P1 |
| INV-API-147 | `/api/v1/notifications/read-all` | POST | notifications | P1 |
| INV-API-148 | `/api/v1/notifications` | GET | notifications | P1 |
| INV-API-149 | `/api/v1/orders/[id]/invoice` | GET | orders | P1 |
| INV-API-150 | `/api/v1/orders/[id]/reorder` | POST | orders | P1 |
| INV-API-151 | `/api/v1/orders/[id]/return` | GET,POST | orders | P1 |
| INV-API-152 | `/api/v1/orders/[id]/review` | GET,POST | orders | P1 |
| INV-API-153 | `/api/v1/orders/[id]/status` | PATCH | orders | P1 |
| INV-API-154 | `/api/v1/orders/[id]/submit` | PATCH | orders | P1 |
| INV-API-155 | `/api/v1/orders/[id]` | GET,DELETE | orders | P1 |
| INV-API-156 | `/api/v1/orders` | GET,POST | orders | P1 |
| INV-API-157 | `/api/v1/payments/abandon` | POST | payments | P1 |
| INV-API-158 | `/api/v1/payments/initiate` | POST | payments | P1 |
| INV-API-159 | `/api/v1/payments/verify` | POST | payments | P1 |
| INV-API-160 | `/api/v1/payments/webhook` | POST | payments | P1 |
| INV-API-161 | `/api/v1/permissions/registry` | GET | permissions | P5 |
| INV-API-162 | `/api/v1/products/[id]/alternates` | GET | products | P1 |
| INV-API-163 | `/api/v1/products/[id]` | GET | products | P1 |
| INV-API-164 | `/api/v1/products/deals` | GET | products | P1 |
| INV-API-165 | `/api/v1/promotions/preview` | POST | promotions | P1 |
| INV-API-166 | `/api/v1/promotions/rewards/[id]/claim` | POST | promotions | P1 |
| INV-API-167 | `/api/v1/promotions/rewards` | GET | promotions | P1 |
| INV-API-168 | `/api/v1/push/subscribe` | POST,DELETE | push | P1 |
| INV-API-169 | `/api/v1/search` | GET | search | P1 |
| INV-API-170 | `/api/v1/upload` | POST | upload | P2 |
| INV-API-171 | `/api/v1/vendor/application-status` | GET | vendor | P2 |
| INV-API-172 | `/api/v1/vendor/brand-mappings/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-173 | `/api/v1/vendor/brand-mappings/brands` | GET | vendor | P2 |
| INV-API-174 | `/api/v1/vendor/brand-mappings/suggest` | POST | vendor | P2 |
| INV-API-175 | `/api/v1/vendor/brand-mappings` | GET,POST | vendor | P2 |
| INV-API-176 | `/api/v1/vendor/brands/suggest` | POST | vendor | P2 |
| INV-API-177 | `/api/v1/vendor/cashback/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-178 | `/api/v1/vendor/cashback` | GET,POST | vendor | P2 |
| INV-API-179 | `/api/v1/vendor/categories/suggest` | POST | vendor | P2 |
| INV-API-180 | `/api/v1/vendor/claims/[id]` | PATCH | vendor | P2 |
| INV-API-181 | `/api/v1/vendor/claims` | GET,POST | vendor | P2 |
| INV-API-182 | `/api/v1/vendor/collections/[id]` | POST,PATCH | vendor | P2 |
| INV-API-183 | `/api/v1/vendor/collections` | GET,POST | vendor | P2 |
| INV-API-184 | `/api/v1/vendor/combos` | GET,POST | vendor | P2 |
| INV-API-185 | `/api/v1/vendor/commission-rules/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-186 | `/api/v1/vendor/commission-rules` | GET,POST | vendor | P2 |
| INV-API-187 | `/api/v1/vendor/commissions/[id]/approve` | POST | vendor | P2 |
| INV-API-188 | `/api/v1/vendor/commissions/[id]/cancel` | POST | vendor | P2 |
| INV-API-189 | `/api/v1/vendor/commissions/[id]/paid` | POST | vendor | P2 |
| INV-API-190 | `/api/v1/vendor/commissions/summary` | GET | vendor | P2 |
| INV-API-191 | `/api/v1/vendor/commissions` | GET | vendor | P2 |
| INV-API-192 | `/api/v1/vendor/coupons/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-193 | `/api/v1/vendor/coupons` | GET,POST | vendor | P2 |
| INV-API-194 | `/api/v1/vendor/credit/[walletId]/statement` | GET | vendor | P2 |
| INV-API-195 | `/api/v1/vendor/credit/[walletId]` | PATCH | vendor | P2 |
| INV-API-196 | `/api/v1/vendor/credit/customers` | GET | vendor | P2 |
| INV-API-197 | `/api/v1/vendor/credit/remind` | POST | vendor | P2 |
| INV-API-198 | `/api/v1/vendor/credit/repay` | POST | vendor | P2 |
| INV-API-199 | `/api/v1/vendor/credit` | GET,POST | vendor | P2 |
| INV-API-200 | `/api/v1/vendor/customer-groups/[id]` | GET,PATCH,DELETE | vendor | P2 |
| INV-API-201 | `/api/v1/vendor/customer-groups` | GET,POST | vendor | P2 |
| INV-API-202 | `/api/v1/vendor/customer-prices` | GET,POST,DELETE | vendor | P2 |
| INV-API-203 | `/api/v1/vendor/customers/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-204 | `/api/v1/vendor/customers` | GET,POST | vendor | P2 |
| INV-API-205 | `/api/v1/vendor/customer-tasks` | GET,POST,PATCH,DELETE | vendor | P2 |
| INV-API-206 | `/api/v1/vendor/dashboard` | GET | vendor | P2 |
| INV-API-207 | `/api/v1/vendor/documents/upload` | POST | vendor | P2 |
| INV-API-208 | `/api/v1/vendor/documents` | GET,POST | vendor | P2 |
| INV-API-209 | `/api/v1/vendor/inventory/consolidated` | GET | vendor | P2 |
| INV-API-210 | `/api/v1/vendor/inventory/export` | GET | vendor | P2 |
| INV-API-211 | `/api/v1/vendor/inventory/import` | GET,POST | vendor | P2 |
| INV-API-212 | `/api/v1/vendor/inventory/transfer` | POST | vendor | P2 |
| INV-API-213 | `/api/v1/vendor/inventory` | GET,POST,PATCH | vendor | P2 |
| INV-API-214 | `/api/v1/vendor/ledger` | GET | vendor | P2 |
| INV-API-215 | `/api/v1/vendor/notifications` | GET,PATCH | vendor | P2 |
| INV-API-216 | `/api/v1/vendor/onboarding/documents` | POST | vendor | P2 |
| INV-API-217 | `/api/v1/vendor/onboarding/submit` | POST | vendor | P2 |
| INV-API-218 | `/api/v1/vendor/orders/[id]/delivery-otp` | POST | vendor | P2 |
| INV-API-219 | `/api/v1/vendor/orders/[id]/invoice` | GET | vendor | P2 |
| INV-API-220 | `/api/v1/vendor/orders/[id]/picklist` | GET | vendor | P2 |
| INV-API-221 | `/api/v1/vendor/orders/[id]` | GET,PATCH | vendor | P2 |
| INV-API-222 | `/api/v1/vendor/orders` | GET | vendor | P2 |
| INV-API-223 | `/api/v1/vendor/outlets` | GET | vendor | P2 |
| INV-API-224 | `/api/v1/vendor/price-lists/[id]/bulk-apply` | POST | vendor | P2 |
| INV-API-225 | `/api/v1/vendor/price-lists/[id]/bulk-upload` | POST | vendor | P2 |
| INV-API-226 | `/api/v1/vendor/price-lists/[id]` | GET,PATCH,DELETE | vendor | P2 |
| INV-API-227 | `/api/v1/vendor/price-lists/workspace` | GET,PATCH | vendor | P2 |
| INV-API-228 | `/api/v1/vendor/price-lists` | GET,POST | vendor | P2 |
| INV-API-229 | `/api/v1/vendor/pricing-targets` | GET | vendor | P2 |
| INV-API-230 | `/api/v1/vendor/products/[id]/audit` | GET | vendor | P2 |
| INV-API-231 | `/api/v1/vendor/products/[id]` | GET,PATCH,DELETE | vendor | P2 |
| INV-API-232 | `/api/v1/vendor/products/bulk-import` | POST | vendor | P2 |
| INV-API-233 | `/api/v1/vendor/products/bulk-price` | PATCH | vendor | P2 |
| INV-API-234 | `/api/v1/vendor/products/bulk-update` | PATCH | vendor | P2 |
| INV-API-235 | `/api/v1/vendor/products/count` | GET | vendor | P2 |
| INV-API-236 | `/api/v1/vendor/products/export` | GET | vendor | P2 |
| INV-API-237 | `/api/v1/vendor/products/import` | GET,POST | vendor | P2 |
| INV-API-238 | `/api/v1/vendor/products/suggestions` | GET | vendor | P2 |
| INV-API-239 | `/api/v1/vendor/products` | GET,POST | vendor | P2 |
| INV-API-240 | `/api/v1/vendor/promotions/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-241 | `/api/v1/vendor/promotions` | GET,POST | vendor | P2 |
| INV-API-242 | `/api/v1/vendor/reports` | GET | vendor | P2 |
| INV-API-243 | `/api/v1/vendor/returns/[id]` | PATCH | vendor | P2 |
| INV-API-244 | `/api/v1/vendor/returns` | GET | vendor | P2 |
| INV-API-245 | `/api/v1/vendor/roles/[id]` | PATCH,DELETE | vendor | P2 |
| INV-API-246 | `/api/v1/vendor/roles` | GET,POST | vendor | P2 |
| INV-API-247 | `/api/v1/vendor/salespersons/[id]` | GET,PATCH,DELETE | vendor | P2 |
| INV-API-248 | `/api/v1/vendor/salespersons` | GET,POST | vendor | P2 |
| INV-API-249 | `/api/v1/vendor/search` | GET | vendor | P2 |
| INV-API-250 | `/api/v1/vendor/settings/delivery-slots` | POST,PATCH,DELETE | vendor | P2 |
| INV-API-251 | `/api/v1/vendor/settings/service-areas` | POST,PATCH,DELETE | vendor | P2 |
| INV-API-252 | `/api/v1/vendor/settings` | GET,PATCH | vendor | P2 |
| INV-API-253 | `/api/v1/vendor/setup` | GET,PATCH | vendor | P2 |
| INV-API-254 | `/api/v1/vendor/team/[id]/password` | PATCH | vendor | P2 |
| INV-API-255 | `/api/v1/vendor/team/[id]` | GET,PATCH,DELETE | vendor | P2 |
| INV-API-256 | `/api/v1/vendor/team` | GET,POST | vendor | P2 |
| INV-API-257 | `/api/v1/vendor/wallet/payout` | POST | vendor | P2 |
| INV-API-258 | `/api/v1/vendor/wallet` | GET,POST | vendor | P2 |
| INV-API-259 | `/api/v1/vendor/warehouse/dispatches/[id]` | GET,PATCH | vendor | P2 |
| INV-API-260 | `/api/v1/vendor/warehouse/dispatches` | GET,POST | vendor | P2 |
| INV-API-261 | `/api/v1/vendor/warehouse/grn/[id]` | GET,PATCH | vendor | P2 |
| INV-API-262 | `/api/v1/vendor/warehouse/grn` | GET,POST | vendor | P2 |
| INV-API-263 | `/api/v1/vendor/warehouse/lookup` | GET | vendor | P2 |
| INV-API-264 | `/api/v1/vendor/warehouse/picklists/[id]` | GET,PATCH | vendor | P2 |
| INV-API-265 | `/api/v1/vendor/warehouse/picklists` | GET,POST | vendor | P2 |
| INV-API-266 | `/api/v1/vendors/[id]/delivery-slots` | GET | vendors | P1 |
| INV-API-267 | `/api/v1/vendors/[id]/follow` | POST,DELETE | vendors | P1 |
| INV-API-268 | `/api/v1/vendors/[id]/products` | GET | vendors | P1 |
| INV-API-269 | `/api/v1/vendors/[id]/reviews` | GET | vendors | P1 |
| INV-API-270 | `/api/v1/vendors/[id]/store-promotions` | GET | vendors | P1 |
| INV-API-271 | `/api/v1/vendors/[id]` | GET | vendors | P1 |
| INV-API-272 | `/api/v1/vendors/my-vendors` | GET | vendors | P1 |
| INV-API-273 | `/api/v1/vendors/serviceability` | GET | vendors | P1 |
| INV-API-274 | `/api/v1/vendors` | GET | vendors | P1 |
| INV-API-275 | `/api/v1/wallet/create-repayment-order` | POST | wallet | P1 |
| INV-API-276 | `/api/v1/wallet/debit` | POST | wallet | P1 |
| INV-API-277 | `/api/v1/wallet/razorpay-webhook` | POST | wallet | P1 |
| INV-API-278 | `/api/v1/wallet/reactivate` | POST | wallet | P1 |
| INV-API-279 | `/api/v1/wallet/reports` | GET | wallet | P1 |
| INV-API-280 | `/api/v1/wallet/verify-repayment` | POST | wallet | P1 |
| INV-API-281 | `/api/v1/wallet` | GET | wallet | P1 |

### 2.3 Domain family notes

| Family | Notes for testing |
|--------|-------------------|
| `auth/*` | OTP rate limits; logout cookie clear; session-stale; switch BA/outlet |
| `cart/*` + `orders/*` + `payments/*` | Vendor-grouped cart; MOV; oversell; initiate/verify/abandon; webhook HMAC |
| `vendor/*` (95) | Largest surface — outlet-scoped inventory/warehouse; `resolveVendorContext` |
| `admin/*` (76) | Approvals, impersonation, settlements/credit cron |
| `brand/*` | Mappings, distributors, team; `resolveBrandContext` |
| `account/*` | BA users/roles/outlets; become-vendor |
| `wallet/*` + `credit/*` | DiSCCO credit repay/reactivate; wallet Razorpay webhook |

---

## 3. Overlay / Modal / Drawer / Dialog inventory

**Total named UI shells (filename match):** 42

| ID | Component | Kind | Pack | Notes |
|----|-----------|------|------|-------|
| INV-UI-001 | `src/components/auth/AccountOverviewOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-002 | `src/components/auth/BecomeVendorModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-003 | `src/components/auth/CreateBusinessAccountModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-004 | `src/components/auth/EditProfileOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-005 | `src/components/auth/ExistingPhoneModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-006 | `src/components/auth/GeneralInformationOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-007 | `src/components/auth/LoginOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-008 | `src/components/auth/MyBusinessAccountsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-009 | `src/components/auth/NotificationOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-010 | `src/components/auth/OutletsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-011 | `src/components/auth/PaymentManagementOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-012 | `src/components/auth/RewardsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-013 | `src/components/auth/RolesPermissionsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-014 | `src/components/auth/SavedAddressesOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-015 | `src/components/auth/SettingsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-016 | `src/components/auth/TeamMembersOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-017 | `src/components/features/admin/ApprovalReviewDrawer.tsx` | Drawer | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-018 | `src/components/features/admin/BrandFormModal.tsx` | Modal | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-019 | `src/components/features/admin/credit/AdminAssignCreditModal.tsx` | Modal | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-020 | `src/components/features/admin/credit/ReactivateWalletModal.tsx` | Modal | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-021 | `src/components/features/admin/CustomerFormModal.tsx` | Modal | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-022 | `src/components/features/admin/ProductImportModal.tsx` | Modal | P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-023 | `src/components/features/brand/BrandProductImportModal.tsx` | Modal | P3 | focus trap / ESC / backdrop (P8) |
| INV-UI-024 | `src/components/features/order-lists/CreateListOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-025 | `src/components/features/shared/BulkEngineDrawer.tsx` | Drawer | P2/P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-026 | `src/components/features/shared/ProductImportModal.tsx` | Modal | P2/P4 | focus trap / ESC / backdrop (P8) |
| INV-UI-027 | `src/components/features/team/EditMemberModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-028 | `src/components/features/team/InviteSuccessModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-029 | `src/components/features/team/ResetPasswordModal.tsx` | Modal | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-030 | `src/components/features/vendor/FileClaimModal.tsx` | Modal | P2 | focus trap / ESC / backdrop (P8) |
| INV-UI-031 | `src/components/features/vendor/StockTransferModal.tsx` | Modal | P2 | focus trap / ESC / backdrop (P8) |
| INV-UI-032 | `src/components/features/vendor/VendorProductImportModal.tsx` | Modal | P2 | focus trap / ESC / backdrop (P8) |
| INV-UI-033 | `src/components/features/vendor/warehouse/WarehouseDetailDrawer.tsx` | Drawer | P2 | focus trap / ESC / backdrop (P8) |
| INV-UI-034 | `src/components/layout/AddNewAddressOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-035 | `src/components/layout/EditAddressOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-036 | `src/components/layout/InitialPincodeOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-037 | `src/components/layout/LocationSelectionOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-038 | `src/components/layout/MobileSearchOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-039 | `src/components/layout/ReviewItemsOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-040 | `src/components/layout/StoreDetailOverlay.tsx` | Overlay | P1 | focus trap / ESC / backdrop (P8) |
| INV-UI-041 | `src/components/ui/ConfirmDialog.tsx` | Dialog | P8 | focus trap / ESC / backdrop (P8) |
| INV-UI-042 | `src/components/ui/ImageEditorModal.tsx` | Modal | P8 | focus trap / ESC / backdrop (P8) |

**Also exercise (not filename-matched):** `AddMemberWizard`, `TeamRolesEditor`, `MandatoryAddressGate`, `BusinessAccountSwitcherDropdown`, admin/vendor bulk engines, promo engine tabs — cover under P1/P2/P4 + P8.

**Removed:** Wishlist overlay/page (expect 404 / no nav entry).

---

## 4. Major workflows → packs

| Workflow | Actors | Key pages | Key APIs | Packs |
|----------|--------|-----------|----------|-------|
| Register / OTP (customer, vendor, brand) | public | `/register`, `/vendor/register`, `/brand/register` | `auth/otp/*`, `auth/signup` | P1, P2, P3, P6, P7 |
| Login / logout / session | all | `/login`, profile | `auth/[...nextauth]`, `auth/me`, `auth/logout` | P1, P5, P7 |
| Browse → search → category → vendor → PDP | public/customer | `/`, `/search`, `/category/*`, `/vendor/[id]`, `/product/[id]` | `search`, `vendors/*`, `products/*` | P0, P1, P9 |
| Add to cart → MOV → checkout → payment | customer | `/cart`, `/checkout`, `/order-success` | `cart/*`, `checkout/payment-modes`, `payments/*`, `orders` | P1, P6, P7 |
| Orders / invoice / return / review / reorder | customer | `/orders`, `/orders/[id]` | `orders/[id]/*` | P1, P6 |
| Quick order lists | customer | `/order-lists/*` | `lists/*` | P1 |
| Profile / addresses / BA team / outlets | customer/account | `/profile`, `/profile/team`, `/account/[id]/*` | `addresses/*`, `account/*`, `me/*` | P1, P5 |
| Wallet / credit apply / repay | customer | `/wallet`, overlays | `wallet/*`, `credit/*` | P1, P4 |
| Vendor fulfill order (status machine) | vendor | `/vendor/orders`, `/vendor/orders/[id]` | `vendor/orders/*` | P2, P6 |
| Inventory / warehouse GRN / pick / dispatch / transfer | vendor | `/vendor/inventory`, `/vendor/warehouse` | `vendor/inventory/*`, `vendor/warehouse/*` | P2 |
| Vendor catalog / import / price lists / promotions | vendor | `/vendor/products`, `/vendor/price-lists/*`, `/vendor/promotions` | `vendor/products/*`, `vendor/price-lists/*`, `vendor/promotions/*` | P2, P6 |
| Vendor credit / wallet / ledger | vendor | `/vendor/credit`, `/vendor/wallet`, `/vendor/ledger` | `vendor/credit/*`, `vendor/wallet/*` | P2 |
| Sales team / commissions | vendor | `/vendor/sales-team` | `vendor/salespersons/*`, `vendor/commissions/*` | P2, P5 |
| Brand products / distributors / analytics | brand | `/brand/portal/*` | `brand/*` | P3 |
| Brand public storefront | public | `/brand/[brandId]`, `/brands` | `brands/*` | P1, P3 |
| Admin approvals / entity CRUD | admin | `/admin/approvals`, vendors/brands/customers/products | `admin/*` | P4 |
| Admin finance / settlements / credit / ledger | admin | `/admin/finance`, `/admin/ledger`, `/admin/credit` | `admin/finance`, `settlements/*`, `credit/*` | P4 |
| Admin impersonation enter/exit | admin→* | storefront/portal banners | `admin/impersonate*` | P4, P5 |
| Team invite / roles / password reset | all portals | team pages + modals | `*/team`, `*/roles`, password routes | P5 |
| Notifications (in-app) | customer/vendor | overlays / vendor notifications | `notifications/*`, `vendor/notifications` | P1, P2, P5 |
| Document upload / KYC | vendor/admin | settings / admin vendor detail | `vendor/documents/*`, `admin/vendors/.../documents` | P2, P4, P7 |

---

## 5. Permissions & nav reference

### 5.1 Permission keys (`src/lib/permissions/registry.ts`)

**Total keys:** 78

```
dashboard.view
products.view
products.create
products.edit
products.delete
products.approve
brandStore.view
brandStore.edit
orders.view
orders.create
orders.edit
orders.delete
orders.approve
repeatOrders.view
repeatOrders.create
repeatOrders.edit
inventory.view
inventory.create
inventory.edit
inventory.delete
grn.view
grn.create
grn.edit
dispatch.view
dispatch.create
dispatch.edit
deliveries.view
deliveries.edit
deliveries.approve
payments.view
payments.create
payments.approve
creditLine.view
creditLine.approve
customers.view
customers.create
customers.edit
customers.delete
vendors.view
vendors.create
vendors.edit
vendors.delete
vendors.approve
brands.view
brands.create
brands.edit
brands.delete
brands.approve
users.view
users.create
users.edit
users.delete
outlets.view
outlets.create
outlets.edit
outlets.delete
analytics.view
promotions.view
promotions.create
promotions.edit
promotions.delete
support.view
support.edit
logistics.view
logistics.edit
auditLogs.view
settings.view
settings.edit
storefront.view
storefront.order
storefront.pay
salespersons.view
salespersons.create
salespersons.edit
salespersons.delete
commissions.view
commissions.edit
commissions.approve
```

### 5.2 Admin nav (`ADMIN_NAV_GROUPS` in `portalNav.ts`)

| Group | Link | href | requiredPerm |
|-------|------|------|--------------|
| Operations | Dashboard | `/admin/dashboard` | `dashboard.view` |
| Operations | Orders | `/admin/orders` | `orders.view` |
| Operations | Returns | `/admin/returns` | `orders.view` |
| Operations | Claims | `/admin/claims` | `orders.view` |
| Operations | Approvals | `/admin/approvals` | `vendors.approve | brands.approve | products.approve` |
| Marketplace | Customers | `/admin/customers` | `customers.view` |
| Marketplace | Vendors | `/admin/vendors` | `vendors.view` |
| Marketplace | Products | `/admin/products` | `products.view` |
| Marketplace | Categories | `/admin/categories` | `products.view` |
| Marketplace | Brands | `/admin/brands` | `brands.view` |
| Finance | Overview | `/admin/finance` | `payments.view` |
| Finance | Platform Ledger | `/admin/ledger` | `payments.view` |
| Finance | Reports | `/admin/reports` | `analytics.view` |
| Credit | Credit & Collections | `/admin/credit` | `payments.view` |
| Platform | Promotions | `/admin/promotions` | `promotions.view` |
| Platform | Audit Logs | `/admin/audit-logs` | `auditLogs.view` |
| Platform | Team | `/admin/team` | `users.view|create|edit|delete` |
| Platform | Settings | `/admin/settings` | `settings.view` |

### 5.3 Vendor nav (`VENDOR_NAV_GROUPS`)

| Group | Link | href | requiredPerm |
|-------|------|------|--------------|
| Operations | Dashboard | `/vendor/dashboard` | `dashboard.view` |
| Operations | Orders | `/vendor/orders` | `orders.view` |
| Operations | Inventory | `/vendor/inventory` | `inventory.view` |
| Operations | Warehouse | `/vendor/warehouse` | `inventory.view (feature: grn)` |
| Operations | Returns | `/vendor/returns` | `orders.view` |
| Operations | Claims | `/vendor/claims` | `orders.view` |
| Catalog | Products | `/vendor/products` | `products.view` |
| Catalog | Brand Mappings | `/vendor/brand-mappings` | `products.view` |
| Catalog | Price Lists | `/vendor/price-lists` | `products.edit` |
| Catalog | Promotions | `/vendor/promotions` | `promotions.view` |
| Customers | Customers | `/vendor/customers` | `customers.view` |
| Customers | Sales Team | `/vendor/sales-team` | `salespersons.view | commissions.view` |
| Finance | Credit & Collections | `/vendor/credit` | `creditLine.view | creditLine.approve` |
| Finance | Wallet | `/vendor/wallet` | `payments.view` |
| Finance | Ledger | `/vendor/ledger` | `payments.view` |
| Finance | Reports | `/vendor/reports` | `analytics.view` |
| Account | Notifications | `/vendor/notifications` | `settings.view` |
| Account | Business account | `/vendor/account` | `dashboard.view` |
| Account | Team | `/vendor/team` | `users.view|create|edit|delete` |
| Account | Outlets | `/vendor/outlets` | `outlets.view` |
| Account | Settings | `/vendor/settings` | `settings.view` |

### 5.4 Brand nav (`BRAND_NAV_LINKS`)

| Link | href | requiredPerm |
|------|------|--------------|
| Dashboard | `/brand/portal` | `dashboard.view` |
| My Products | `/brand/portal/products` | `products.view` |
| Distributors | `/brand/portal/distributors` | `vendors.view` |
| Analytics | `/brand/portal/analytics` | `analytics.view` |
| Team | `/brand/portal/team` | `users.view|create|edit|delete` |
| Settings | `/brand/portal/settings` | `settings.view` |

### 5.5 Account / customer route permissions (`routePermissions.ts`)

| Path prefix | Permission |
|-------------|------------|
| `/profile/team` | `users.view\|create\|edit\|delete` |
| `/orders` | `orders.view` |
| `/order-lists` | `repeatOrders.view` |
| `/wallet` | `creditLine.view` |
| `/account` | `settings.view` |
| Account tab `/outlets` | `outlets.view` |
| Account tab `/users`, `/roles` | `users.view` |

### 5.6 Extra routes (nav-adjacent)

| Path | Actor | Perm / note |
|------|-------|-------------|
| `/admin/brand-distributor-invites` | admin | `brands.view` |
| `/vendor/customer-groups` | vendor | `customers.view` |
| `/vendor/collections` | vendor | `creditLine.view` |
| `/vendor/setup` | vendor | `dashboard.view` |
| `/vendor/price-lists/workspace`, `/vendor/price-lists/[id]` | vendor | parent `products.edit` |
| `/vendor/orders/[id]` | vendor | parent `orders.view` |
| `/admin/*/ [id]` detail pages | admin | parent list permission |

---

## 6. Coverage checklist

Use these IDs in pack results and bug reports.

### 6.1 Pages — `INV-PAGE-001` … `INV-PAGE-091`

- [ ] All 91 pages crawled (P0)
- [ ] Actor auth gate verified (proxy + layout)
- [ ] Portal pages respect `requiredPerm` (nav hide + PortalPageGuard)
- [ ] Mobile 390 smoke on critical customer/vendor/admin shells (P8)

### 6.2 APIs — `INV-API-001` … `INV-API-281`

- [ ] All 281 route files method-scanned (this inventory)
- [ ] Auth: unauthenticated → 401 where required (P6)
- [ ] Cross-tenant IDOR probes on mutating vendor/brand/admin routes (P5/P7)
- [ ] Validation: bad JSON → 400 (P6)
- [ ] Webhooks: payments + wallet HMAC reject (P6/P7)
- [ ] Rate limit: OTP / auth session burst (P6/P7)

### 6.3 UI shells — `INV-UI-001` … `INV-UI-042`

- [ ] All 42 overlays/modals/drawers/dialogs open/close (P8)
- [ ] Focus trap + ESC + backdrop click
- [ ] No leftover wishlist entry points

### 6.4 Pack completion matrix

| Pack | Inventory coverage | Status |
|------|--------------------|--------|
| P0 | All INV-PAGE + smoke | ☐ |
| P1 | Customer pages + cart/checkout/orders workflows | ☐ |
| P2 | Vendor pages + fulfill/inventory/catalog | ☐ |
| P3 | Brand portal + register + storefront | ☐ |
| P4 | Admin pages + approvals/finance/impersonation | ☐ |
| P5 | RBAC/nav perms + IDOR + impersonation scope | ☐ |
| P6 | INV-API matrix | ☐ |
| P7 | Security probes | ☐ |
| P8 | INV-UI + responsive/a11y | ☐ |
| P9 | Perf spot-check home/search/PDP/cart | ☐ |

---

## 7. Related artifacts

| Artifact | Role |
|----------|------|
| `E2E_DEFECTS.md` | Prior prod/gap E2E ledger |
| `tmp-pack-customer.md` / `tmp-pack-admin.md` | Prior pack run notes |
| `e2e/smoke-crawl.spec.ts` | P0 crawl seed |
| `GO_LIVE_READINESS_AUDIT.md` | Historical go-live gaps (may be stale) |
| `src/proxy.ts` | Edge auth gate |
| `src/lib/permissions/portalNav.ts` | Sidebar nav |
| `src/lib/permissions/routePermissions.ts` | Page → perm map |
| `src/lib/permissions/registry.ts` | Permission key registry |

---

*End of inventory. Application source was not modified.*

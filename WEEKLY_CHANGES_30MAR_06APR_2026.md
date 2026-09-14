# Weekly Changes — March 30 to April 6, 2026

**Project:** Horeca1 (B2B e-commerce marketplace)
**Period:** Monday 30 March 2026 – Sunday 6 April 2026
**Contributors:** mayur5689, sanket gade
**Total commits:** 17 (including 1 merge commit)

---

## Table of Contents

1. [Summary Overview](#1-summary-overview)
2. [Backend Changes](#2-backend-changes)
   - [Database Schema](#21-database-schema)
   - [Auth API Routes](#22-auth-api-routes)
   - [Vendor API Routes](#23-vendor-api-routes)
   - [Admin API Routes](#24-admin-api-routes)
   - [Service Layer](#25-service-layer)
   - [Middleware](#26-middleware)
3. [Frontend / UI Changes](#3-frontend--ui-changes)
   - [Auth & Account Switching](#31-auth--account-switching)
   - [Vendor Onboarding Banner](#32-vendor-onboarding-banner)
   - [Vendor Detail Page & Store UI](#33-vendor-detail-page--store-ui)
   - [Product Detail Page](#34-product-detail-page)
   - [Homepage Sections](#35-homepage-sections)
   - [Category Showcase](#36-category-showcase)
   - [Shared Components & Utilities](#37-shared-components--utilities)
   - [Navigation & Layout](#38-navigation--layout)
4. [DevOps / Infrastructure](#4-devops--infrastructure)
5. [Day-by-Day Commit Log](#5-day-by-day-commit-log)

---

## 1. Summary Overview

This was a high-velocity week with **3 major feature areas** delivered:

| Area | What was built |
|---|---|
| **Multi-account system** | Vendors can link multiple accounts, encrypted credential storage moved from localStorage to DB, full switch-account flow |
| **Vendor onboarding pipeline** | Application status tracking, admin verification endpoint, dashboard route restructure, conditional banner UI |
| **Bulk product import/export** | Excel-driven import with preview + commit modes, 2-step import modal, export API, ~1,500 lines of new code |

Plus significant UI polish across vendor detail, product detail, homepage, category browsing, hero banner, and search.

---

## 2. Backend Changes

### 2.1 Database Schema

**File:** `prisma/schema.prisma`
**Migration:** `prisma/migrations/.../migration.sql` (+28 lines)

A new `LinkedAccount` model was added to support multi-account linking for vendors.

**New model fields:**
- `id` — primary key
- `userId` — foreign key to `User`
- `linkedUserId` — the account being linked
- `label` — display name for the linked account
- `encryptedCredentials` — encrypted token stored in DB (replaces the previous localStorage-based `account-store.ts`)
- `createdAt` / `updatedAt` timestamps

**Reason:** The previous implementation stored encrypted credentials in `localStorage` via `src/lib/account-store.ts`. This was unreliable across sessions and browsers. Moving storage to the DB makes linked accounts persistent and server-authoritative.

---

### 2.2 Auth API Routes

Four new API routes were added under `src/app/api/v1/auth/`:

#### `POST /api/v1/auth/link-account`
**File:** `src/app/api/v1/auth/link-account/route.ts` (+90 lines)

Links a secondary vendor account to the currently authenticated user. Accepts credentials, validates them, encrypts the token, and creates a `LinkedAccount` record in the DB.

#### `PATCH /api/v1/auth/link-account/[id]`
**File:** `src/app/api/v1/auth/link-account/[id]/route.ts` (+46 lines)

Updates the label or refreshes encrypted credentials for a specific linked account. Used when re-authenticating a linked account.

#### `GET /api/v1/auth/linked-accounts`
**File:** `src/app/api/v1/auth/linked-accounts/route.ts` (+30 lines)

Returns all accounts linked to the current session user. Used by the `AccountSwitcherDropdown` to render the list of switchable accounts.

#### `POST /api/v1/auth/switch-account`
**File:** `src/app/api/v1/auth/switch-account/route.ts` (+59 lines)

Accepts a `linkedAccountId`, decrypts the stored credentials, and issues a new session for the target account. The user is transparently switched without re-entering a password.

**Auth.ts updates** (`src/auth.ts`, +30 lines in first pass, +10 in second):
- Session callback now includes `vendorStatus` from DB
- JWT callback extended to persist vendor application state
- Auth config updated to handle linked account sessions

---

### 2.3 Vendor API Routes

#### `GET /api/v1/vendor/application-status`
**File:** `src/app/api/v1/vendor/application-status/route.ts` (+43 lines, NEW)

Returns the vendor application status for the current user. Possible values: `none`, `pending`, `approved`, `rejected`. Used by the `VendorApplicationBanner` component to decide which banner state to show.

---

### 2.4 Admin API Routes

#### `PATCH /api/v1/admin/vendors/[id]`
**File:** `src/app/api/v1/admin/vendors/[id]/route.ts` (+13 lines)

Added `status` update support so admin can approve or reject a vendor application. Previously only metadata updates were supported.

#### `GET|POST /api/v1/admin/categories/[id]`
**File:** `src/app/api/v1/admin/categories/[id]/route.ts` (minor fix)

Fixed a routing bug where the dynamic `[id]` segment was not being extracted correctly from the request params.

#### `POST /api/v1/admin/products/import`
**File:** `src/app/api/v1/admin/products/import/route.ts` (+355 lines, major rewrite)

Complete rewrite to support **two-phase import**:
- **Preview mode** (`mode=preview`): Parses the uploaded Excel file, validates rows, returns a preview payload with per-row errors and warnings — does NOT write to DB.
- **Commit mode** (`mode=commit`): Takes the validated payload and bulk-inserts into the DB using Prisma transactions.

Error handling returns structured row-level feedback (row number, field, error type).

#### `GET /api/v1/admin/products/export`
**File:** `src/app/api/v1/admin/products/export/route.ts` (+72 lines, major update)

Updated to use the new `excel.service.ts` builder. Exports all products with their bulk pricing tiers, vendor info, and category into a formatted `.xlsx` file with proper column widths and header styling.

#### `GET|POST /api/v1/admin/products`
**File:** `src/app/api/v1/admin/products/route.ts` (+13 lines)

Minor update to add pagination and filtering support for the admin products list.

---

### 2.5 Service Layer

#### `src/modules/import-export/excel.service.ts` (+429 lines, major update)

Major expansion of the Excel service:
- `buildProductExportWorkbook()` — generates a styled Excel workbook from a product array
- `parseProductImportSheet()` — parses an uploaded Excel buffer, validates each row against required columns, returns typed rows + row-level errors
- Column definitions for the import template (productName, sku, category, vendorId, price, bulkPriceTiers, unit, stock)
- Bulk price tier parsing from semicolon-delimited cell format (e.g. `100:₹45;500:₹40`)

#### `src/modules/catalog/catalog.service.ts` (+23 lines)

Updated to support:
- `getProductsByVendorId(vendorId)` — used by vendor product management page
- `createProduct()` now handles image URL from the uploaded file path

#### `src/modules/catalog/search.service.ts` (+14 lines, bug fix)

**Bug fixed:** Search was previously only matching against `product.name`. This caused searches like "dairy" or "Daily Fresh" (a vendor name) to return 0 results.

**Now searches across:**
- Product name
- Product tags array
- Category name (via join)
- Vendor business name (via join)

#### `src/modules/auth/auth.service.ts` (+26 lines)

Extended to:
- `getVendorApplicationStatus(userId)` — fetches vendor application record and returns normalized status string
- `getUserWithLinkedAccounts(userId)` — used during session hydration

---

### 2.6 Middleware

**File:** `middleware.ts` (+16 lines)

Updated route protection logic:
- `/vendor/(dashboard)/**` routes now check for `vendorStatus === 'approved'` before allowing access
- Unapproved vendors are redirected to the homepage (where the `VendorApplicationBanner` is shown)
- Previously the vendor dashboard had no status-based gating

---

## 3. Frontend / UI Changes

### 3.1 Auth & Account Switching

#### `src/lib/account-store.ts` — DELETED

The `account-store.ts` file (153 lines) that managed encrypted credentials in `localStorage` was fully removed. All storage is now DB-backed via the new auth API routes.

#### `src/hooks/useAccountSwitcher.ts` (full rewrite, 172 lines)

The hook was rewritten to:
- Fetch linked accounts from `GET /api/v1/auth/linked-accounts` on mount
- Call `POST /api/v1/auth/switch-account` on switch (instead of reading from localStorage)
- Track `isLoading` and `error` states per account
- Expose `linkAccount(credentials)` and `unlinkAccount(id)` methods

#### `src/components/auth/account-switcher/AccountSwitcherDropdown.tsx` (major refactor, 421 lines)

Complete visual and logic overhaul:
- Dropdown now shows avatar, business name, role badge, and "active" indicator for current account
- "Link another account" flow — opens inline form to enter credentials for a secondary account
- Switch animation using Framer Motion slide transition
- Loading spinner per account row during switch
- Previously used localStorage; now fully API-driven

#### `src/components/auth/AuthScreen.tsx` (+29 lines)

Updated to integrate the `useAccountSwitcher` hook state. After login, if the user has linked accounts the `AccountSwitcherDropdown` is pre-populated.

#### `src/components/auth/LoginOverlay.tsx` (refactor, 45 lines changed)

Cleaned up overlay positioning and z-index stacking. Fixed a bug where the overlay was not dismissible on mobile when the keyboard was open.

#### `src/context/WishlistContext.tsx` (+9 lines)

Wishlist is now persisted per-user (keyed by `userId` in localStorage) so wishlists are not lost when switching accounts.

---

### 3.2 Vendor Onboarding Banner

#### `src/components/features/homepage/VendorApplicationBanner.tsx` (NEW, 149 lines)

A homepage banner that appears conditionally based on vendor application status:

| Status | Banner shown |
|---|---|
| `none` | "Become a vendor" CTA with benefits list |
| `pending` | "Application under review" with estimated timeline |
| `rejected` | "Application not approved" with reapply option |
| `approved` | Banner hidden |

Fetches status from `GET /api/v1/vendor/application-status` on mount. Animated with Framer Motion fade-in. Dismissible by the user (persisted to localStorage).

---

### 3.3 Vendor Detail Page & Store UI

This was the largest UI work of the week — a full premium redesign of the vendor storefront.

#### `src/app/vendor/[id]/page.tsx` (+149 lines)

- Redesigned page layout: sticky category nav, hero image with gradient overlay, vendor stats bar
- Added "Featured Products" horizontal scroll section above catalog grid
- Mobile-first layout using CSS Grid with `clamp()` spacing
- Product grid switches from 2-col to 3-col at wider viewports using fluid breakpoints

#### `src/app/vendors/page.tsx` (refactor, 94 lines changed)

- Vendor listing page now uses the new `VendorCardShared` component (previously had inline card markup)
- Added filter bar: sort by rating, delivery time, minimum order
- Skeleton loading state while vendors are being fetched

#### `src/components/features/homepage/VendorCardShared.tsx` (NEW, 149 lines)

A new shared vendor card component used on both the homepage vendor section and the `/vendors` listing page. Features:
- Cover image with fallback gradient
- Logo thumbnail overlaid on cover
- Rating stars, delivery time badge, minimum order label
- "New" and "Featured" badges
- Hover lift animation

#### `src/components/features/vendor/VendorStoreHeader.tsx` (major rewrite, 280 lines)

Full rewrite:
- Full-bleed cover photo with parallax scroll effect
- Circular logo with border and shadow
- Business name, tagline, rating, review count, delivery info row
- "Follow Store" / "Share" action buttons
- Category pill quick-nav below header
- Mobile layout collapses the stats row to a 2x2 grid

#### `src/components/features/vendor/VendorProductCard.tsx` (major refactor, 151 lines)

- Card now shows bulk price tier badges (e.g. "₹45/unit @ 100+")
- Add-to-cart button with quantity stepper integrated inline (no separate modal)
- Wishlist heart icon with animation
- Sold out overlay state
- Image lazy loading with blur placeholder

#### `src/components/features/vendor/VendorCatalogNav.tsx` (update, 89 lines)

- Horizontal scrollable category nav below the store header
- Active category highlighted with underline + color
- Smooth scroll to category section on click using `scrollIntoView`
- Sticky positioning on desktop

---

### 3.4 Product Detail Page

#### `src/app/product/[id]/page.tsx` (+21 lines)

- Added vendor selector section: when multiple vendors sell the same product, a radio-style card list lets the user pick which vendor to buy from
- Price comparison shown across vendors
- "Best value" badge auto-applied to lowest unit price option

#### `src/components/features/vendor/VendorProductCard.tsx` (+21 lines, second pass)

Minor fix on top of the April 3 rewrite: corrected the bulk tier badge alignment on narrow cards (2-column mobile grid).

#### `src/components/features/vendor/VendorStoreHeader.tsx` (+52 lines, second pass)

Fixed layout shift caused by the cover image loading. Added `aspect-ratio` container so the header height is reserved before the image loads (CLS fix).

---

### 3.5 Homepage Sections

#### `src/components/features/ShopByStorePromo.tsx` (refactor, 214 lines)

Refactored from a static grid to a dynamic component:
- Now reads vendor data from props (not hardcoded)
- Responsive grid: 2-col mobile, 3-col tablet, 4-col desktop using `clamp()`
- Each promo card links to the vendor storefront
- Images served from `/public/images/` (6 vendor promo images added)

#### `src/components/features/homepage/Collections.tsx` (refactor, 123 lines)

- "Shop Collections" section redesigned with large editorial tiles
- Three collection images added: `kitchen.png`, `new-arrivals.png`, `weekend.png` (all in `/public/images/collections/`)
- Tile hover effect: image zoom + dark overlay with collection name
- Links to filtered category/search pages

---

### 3.6 Category Showcase

#### `src/components/features/CategoryShowcase.tsx` (multiple passes this week)

**April 1 pass** (104 lines, refactor):
- Switched from a Swiper-based carousel to a CSS scroll-snap horizontal strip
- Each category shown as a circular icon tile with label below
- Active category highlighted

**April 6 pass** (+27 lines, mobile fix):
- Fixed mobile layout to use a **single horizontal row** with overflow scroll instead of wrapping into multiple rows
- Added `-webkit-overflow-scrolling: touch` for smooth iOS scroll
- Hide scrollbar visually (`scrollbar-width: none`) while keeping it functional

---

### 3.7 Shared Components & Utilities

#### `src/components/ui/ImageUpload.tsx` (two passes, total 194 lines)

**March 31 pass:** Initial improvements:
- Preview thumbnail shown immediately on file select (before upload)
- File size validation (max 5MB)
- Allowed types: `image/jpeg`, `image/png`, `image/webp`

**April 1 pass:**
- Drag-and-drop support added
- Upload progress bar
- Remove/replace button on existing images
- Used in: vendor product form, admin category form

---

### 3.8 Navigation & Layout

#### `src/app/layout.tsx` (updates across April 1)

- Added `GoogleMapsProvider` and `AddressContext` to global providers tree
- `WishlistContext` moved up to root layout so it's available to all pages
- Horeca1 logo (`public/horeca1_logo.jpg`) added to the project

#### `src/components/layout/Navbar.tsx` (refactor, 42 lines net change)

- Logo image replaced with actual `horeca1_logo.jpg` (was a text placeholder)
- `AccountSwitcherDropdown` wired into the user avatar menu
- Mobile nav items adjusted for vendor dashboard link visibility based on session role

#### Vendor dashboard routing restructure

All vendor dashboard pages moved from `src/app/vendor/*` to `src/app/vendor/(dashboard)/*` route group:
- `dashboard/page.tsx`
- `products/page.tsx`
- `orders/page.tsx`
- `orders/[id]/page.tsx`
- `inventory/page.tsx`
- `settings/page.tsx`
- `layout.tsx`, `loading.tsx`, `error.tsx`

The `(dashboard)` route group allows the dashboard layout (with sidebar) to apply only to these routes, without affecting the public-facing `vendor/[id]` storefront page.

#### `src/components/features/Hero.tsx` (refactor, 176 lines)

- Hero banner redesigned with a split layout: text left, image right on desktop
- Mobile: stacked with full-width image below headline
- Search bar integrated into hero (previously was a separate component below)
- CTA buttons: "Browse Vendors" (primary) + "View Categories" (secondary)
- Background uses a gradient from brand color to white

---

## 4. DevOps / Infrastructure

### `.dockerignore` added
**File:** `.dockerignore` (+10 lines)
**Date:** March 31

Added to prevent stale build artifacts from being included in Docker images:
```
node_modules
.next
.env.local
*.log
.git
prisma/migrations (dev-only)
```

Previously missing, which meant `node_modules` could end up copied into the Docker build context, causing slow builds and potential dependency conflicts.

### `DEPLOYMENT.md` added
**File:** `DEPLOYMENT.md` (+361 lines)
**Date:** March 30

Comprehensive production deployment guide covering:
- DigitalOcean Droplet setup ($29/mo single droplet)
- PostgreSQL installation and configuration
- Nginx reverse proxy config for Next.js
- PM2 process manager setup for production Next.js
- Environment variable setup (`.env.production`)
- SSL/TLS with Let's Encrypt + Certbot
- Database backup strategy
- Zero-downtime deploy script

### `local_dump.sql` added
**File:** `local_dump.sql` (+2,200 lines)
**Date:** March 30

PostgreSQL dump of the local development database, including:
- All table DDL (schema)
- Seed data: sample vendors, products, categories, users
- Used to bootstrap a fresh production or staging environment

### `.claude/settings.json` updated
Claude Code hooks and tool permissions updated for the project.

---

## 5. Day-by-Day Commit Log

| Date | Commit | Author | Description |
|---|---|---|---|
| 2026-03-30 | `c98dec0` | mayur5689 | Add production deployment docs, server settings, database dump |
| 2026-03-30 | `d3099f2` | mayur5689 | Vendor onboarding workflow: admin verification, status tracking, dashboard routing |
| 2026-03-30 | `49523300` | mayur5689 | Vendor settings management and admin product/category page fixes |
| 2026-03-30 | `d818497` | mayur5689 | Multi-account switcher: AccountSwitcherDropdown, useAccountSwitcher hook, encrypted credential storage, persistent wishlist context |
| 2026-03-30 | `78a768e` | mayur5689 | Multi-account linking: 4 new auth API routes, LinkedAccount DB model + migration, remove localStorage account-store |
| 2026-03-31 | `36c84db` | mayur5689 | Fix: add `.dockerignore` to prevent stale files in Docker build |
| 2026-03-31 | `13b355e` | mayur5689 | Vendor product management dashboard: products page, ImageUpload improvements, catalog.service updates |
| 2026-03-31 | `2015ed8` | mayur5689 | Bulk product import: ProductImportModal (new), excel.service major update, 2-phase import API (preview + commit) |
| 2026-04-01 | `45541c5` | mayur5689 | Root layout with global providers, responsive Navbar, HoReCa logo added |
| 2026-04-01 | `6ae56dc` | mayur5689 | ShopByStorePromo + Collections components, admin category management API, collection images added |
| 2026-04-01 | `2b9c8e9` | mayur5689 | CategoryShowcase refactor, ImageUpload drag-and-drop + progress bar, next.config update |
| 2026-04-02 | `1467f1e` | sanket gade | Hero banner redesign, LoginOverlay fix, secure auth flow updates |
| 2026-04-03 | `865524c` | mayur5689 | Fix: search now matches by category name, vendor name, and tags |
| 2026-04-03 | `aa112f6` | sanket gade | Vendor detail page premium redesign: VendorStoreHeader, VendorProductCard, VendorCatalogNav, VendorCardShared (new), vendors listing page |
| 2026-04-06 | `a842cae` | mayur5689 | CategoryShowcase: single-row horizontal scroll on mobile |
| 2026-04-06 | `f927d00` | mayur5689 | Merge `feat/auth-conditional-banner` into master |
| 2026-04-06 | `7e2750b` | mayur5689 | Product detail page: vendor selector, VendorProductCard fix, VendorStoreHeader CLS fix |

---

## Files Changed This Week (Key Files)

### New Files
| File | Lines | Purpose |
|---|---|---|
| `src/app/api/v1/auth/link-account/route.ts` | 90 | Link secondary vendor account API |
| `src/app/api/v1/auth/link-account/[id]/route.ts` | 46 | Update linked account API |
| `src/app/api/v1/auth/linked-accounts/route.ts` | 30 | List linked accounts API |
| `src/app/api/v1/auth/switch-account/route.ts` | 59 | Switch active account API |
| `src/app/api/v1/vendor/application-status/route.ts` | 43 | Vendor application status API |
| `src/components/auth/account-switcher/AccountSwitcherDropdown.tsx` | 421 | Account switcher UI |
| `src/hooks/useAccountSwitcher.ts` | 172 | Hook for account switching logic |
| `src/components/features/homepage/VendorApplicationBanner.tsx` | 149 | Conditional vendor CTA banner |
| `src/components/features/homepage/VendorCardShared.tsx` | 149 | Shared vendor card component |
| `src/components/features/admin/ProductImportModal.tsx` | 732 | 2-step bulk import modal |
| `DEPLOYMENT.md` | 361 | Production deployment guide |
| `.dockerignore` | 10 | Docker build exclusions |
| `public/images/collections/kitchen.png` | — | Collection image |
| `public/images/collections/new-arrivals.png` | — | Collection image |
| `public/images/collections/weekend.png` | — | Collection image |
| `public/horeca1_logo.jpg` | — | Brand logo |

### Deleted Files
| File | Reason |
|---|---|
| `src/lib/account-store.ts` | Replaced by DB-backed LinkedAccount model |

### Major Modified Files
| File | Net Change | Summary |
|---|---|---|
| `src/modules/import-export/excel.service.ts` | +429 | Full Excel import/export builder |
| `src/app/api/v1/admin/products/import/route.ts` | +355 | 2-phase import API |
| `src/components/features/vendor/VendorStoreHeader.tsx` | +280 | Premium store header redesign |
| `src/components/features/vendor/VendorProductCard.tsx` | +151 | Bulk pricing + inline cart |
| `src/app/vendor/[id]/page.tsx` | +149 | Vendor storefront page redesign |
| `src/components/features/Hero.tsx` | +176 | Hero banner redesign |
| `src/modules/auth/auth.service.ts` | +26 | Vendor status + linked account queries |
| `src/modules/catalog/search.service.ts` | +14 | Multi-field search fix |
| `prisma/schema.prisma` | +21 | LinkedAccount model |
| `middleware.ts` | +16 | Vendor dashboard access gating |

---

*Document generated: April 10, 2026*

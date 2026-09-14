# Horeca1 — Go-Live Readiness Audit

**Date:** 2026-06-05
**Scope:** The 7 "Go-Live Absolute Must-Haves" supplied by the client + the `User_Profile_Master_Datasheet`.
**Branch audited:** `master` @ `e4f55de`
**Method:** Full codebase audit (schema, services, API routes, UI) by 6 parallel QA/architecture agents, one per domain, each verifying *logic* (not just file existence) with `file:line` evidence. Plus build-health checks (`tsc`, `eslint`).
**Verdict in one line:** **NOT yet go-live-ready against this requirements list.** The engineering foundation is strong (clean type-check, real multi-tenancy, real RBAC, working payments/checkout), but **multiple explicit must-haves are missing or broken** and must be closed first.

> ⚠️ This audit deliberately checks the build **only against the 7 listed requirements**. Credit / Wallet / DiSCCO were explicitly out of scope for this pass (next phase).

---

## 1. Executive Summary

### Scorecard

| # | Requirement Area | Verdict | ✅ | 🟡 | 🔴 |
|---|------------------|---------|----|----|----|
| 1 | User & Access Control | 🟢 **Strong** (minor work) | 7 | 1 | 0 |
| 2 | Customer Management | 🔴 **Not ready** | 9 | 7 | 13 |
| 3 | Brand & Vendor Management | 🟠 **Needs work** | 9 | 2 | 3 |
| 4 & 5 | Item & Category Management | 🔴 **Not ready** | 11 | 6 | 3 |
| 6 | Pricelist Management | 🟠 **Needs work** | 12 | 0 | 2 |
| 7 | Order Management | 🔴 **Not ready** | 4 | 4 | 5 |

**Overall: NOT production-ready** against the full spec. Domains 1, 3 and 6 are close. Domains 2, 4/5 and 7 have hard blockers that touch the data model and core ops workflows.

### What is genuinely solid (don't re-touch)
- **Type safety:** `npx tsc --noEmit` → **0 errors.**
- **Multi-tenancy** is real and enforced per-query (`resolveVendorContext` / `resolveBrandContext` / `resolveBusinessAccountContext`).
- **RBAC** is a real JSON permission matrix (`src/lib/permissions/engine.ts` + `registry.ts`), enforced **server-side** on sensitive mutations — verified on role-create, team-add, price-edit, etc.
- **OTP login** correctly gates the session (single-use + expiry enforced in `src/auth.ts`).
- **Multi-account (HCID)** switching, **outlet-wise ordering** (cart + order keyed by outlet, address snapshotted), **cart → one-PO-per-vendor** checkout, **MOV / slot-cutoff / partial-fulfilment / credit-debit** order math, and **Razorpay** payments are all correctly built and guarded.
- **Pricing resolver** computes all 4 pricing types and the resolved price is recomputed inside the order transaction (tamper-resistant) — good design.

### Build & code health
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ **0 errors** |
| `npm run lint` | ⚠️ **9 errors, 297 warnings** (build ignores these, but see §10) |
| `npm run build` | not blocking — `next.config.ts` ignores TS/lint in build (per project setup) |

> Note: CLAUDE.md claims "0 lint errors." That is **inaccurate** — there are 9 ESLint errors, one of which (`react-hooks/rules-of-hooks`) is a real correctness risk. See §10.

---

## 2. Consolidated Go-Live Blockers (P0)

These are the items that, per the client's own must-have list, are **missing or broken** and should block go-live until resolved.

| ID | Blocker | Domain | Evidence |
|----|---------|--------|----------|
| **P0-1** | **No central / canonical "Horeca1 SKU" item master.** Products are per-vendor rows; the "master catalog" is a runtime `name.toLowerCase()` dedup. The whole premise of Req 4 (Horeca1-owned item master that vendors map to) is absent. | 4 | `prisma/schema.prisma:339`, `src/app/api/v1/admin/products/route.ts:142-162` |
| **P0-2** | **Internal order controls missing:** Edit Orders, Split Orders, Reassign Vendors are **fully absent**; Modify Quantities is reduce-only/pending-only. Ops cannot manage orders post-placement. | 7 | No endpoints under `/api/v1/{orders,admin/orders,vendor/orders}`; no `orders.split`/`orders.reassign` in `registry.ts:16` |
| **P0-3** | **Admin status override bypasses the state machine + side-effects.** Free status dropdown jumps an order to any state; forcing `delivered` skips `finalizeStock`, forcing `confirmed` skips credit debit, un-cancelling never re-reserves stock → **stock & credit ledgers desync in production.** | 7 | `src/app/admin/orders/[id]/route.ts:120-157` vs guarded `order.service.ts:606-612` |
| **P0-4** | **~13 customer master-datasheet attributes have no schema column** and cannot be persisted (Sub-Type, Cuisine, Business Size, Business Structure, Service Model, Monthly Purchase Band, Procurement Frequency, Designation, Lead Status, Credit Type, AI Tags, Behaviour Tags). `businessType` is hardcoded to `'customer'` for every customer. | 2 | grep of `prisma/schema.prisma` + `src` returns no matches; `src/lib/provisionAccount.ts:98` |
| **P0-5** | **Pricelist "Brand" assignment is a dead path.** Resolver matches only `brandName` (free text) and hard-returns `false` for `brandId`; the UI only ever sends `brandId`. A brand-targeted pricelist saves successfully and silently applies to nothing. | 6 | `src/modules/pricing/pricing.service.ts:207-215`, `src/app/vendor/(dashboard)/price-lists/[id]/page.tsx:896-899` |
| **P0-6** | **"Bulk Update — update ANY field" not met.** Both admin & vendor bulk-update use a fixed whitelist; name, sku, unit, packSize, categories, images, tags, aliasNames, barcode, fssaiRef cannot be bulk-edited. Customer bulk-update is even narrower (isActive/status/tags/salesExec/territory only). | 2, 4 | `src/app/api/v1/admin/products/bulk-update/route.ts:41-58`, `src/app/api/v1/admin/users/bulk-update/route.ts:18` |
| **P0-7** | **Vendor master is incomplete for admin KYC review.** Bank details, PAN, FSSAI, trade name, authorized person, pickup address are **collected at onboarding but never selected/shown** in the admin vendor detail. Reviewers approve vendors blind. | 3 | `src/app/api/v1/admin/vendors/[id]/route.ts:26-76` (select omits them) |

---

## 3. Functional Bugs Found (fix regardless of scope)

| ID | Bug | Severity | Evidence |
|----|-----|----------|----------|
| **B-1** | **Veg-type enum mismatch in bulk-update.** Schema accepts `'non_veg'` and writes it through, but the Prisma enum is `nonveg`. A bulk "Non-Veg" update throws a Prisma invalid-enum error. (Single-item route is correct.) | High (crashes a feature) | `src/app/api/v1/admin/products/bulk-update/route.ts:47,109`; `src/app/api/v1/vendor/products/bulk-update/route.ts:64,134` vs `prisma/schema.prisma:1680` |
| **B-2** | **Conditional React hook.** `usePathname` is called after an early return in `OutletCompletionBanner` → violates rules-of-hooks; can crash/misrender. | High | `src/components/auth/OutletCompletionBanner.tsx:33` |
| **B-3** | **Category 2-level guard bypassed by import.** API POST/PATCH enforce 2 levels, but the Excel import path creates with no depth check → Level-3 categories can be smuggled in. | Medium | `src/app/api/v1/admin/categories/import/route.ts:45-66` |
| **B-4** | **Lifecycle events with no listeners.** `processing`, `ready_for_dispatch`, `partially_delivered`, `returned` transitions emit events (via an `as` cast that hides it from the compiler) that have **no registered listener** → no customer notification for "Packing / Ready / Partially Delivered / Returned". | Medium | `src/modules/order/order.service.ts:778`, `src/events/listeners.ts:22-187` |
| **B-5** | **`schemeFreeQty` is dead data.** Captured in schema/API/UI/bulk-upload but never read at order time → "buy X get Y free" half of Scheme pricing is not honored. | Medium | `prisma/schema.prisma:1542`; no read in `order.service.ts` |
| **B-6** | **Alias Names never searched.** `Product.aliasNames` is editable/stored but excluded from `search.service.ts` → inert for discovery. | Low–Med | `src/modules/catalog/search.service.ts:52-59` |
| **B-7** | **Brand team list (GET) not permission-gated** — any brand member (even viewer) can enumerate teammates' email/phone/HCID. Vendor team GET *does* gate it. | Low (info-leak) | `src/app/api/v1/brand/team/route.ts:34-79` |
| **B-8** | **Brand login dead-ends.** After auth, brand users are redirected to `/` and the navbar shows no portal link; they must type `/brand/portal` manually. | Medium (UX blocker for a whole actor type) | `src/app/login/LoginPageInner.tsx:42-44`, `src/components/layout/Navbar.tsx:129-130` |

---

## 4. Requirement 1 — User & Access Control

**Verdict: 🟢 Strong — no domain blockers.** Real JSON permission matrix, server-side enforcement, multi-account HCID model, scoped role templates.

| # | Requirement | Status | Evidence | Gaps |
|---|-------------|--------|----------|------|
| 1 | OTP Login (phone/email) | ✅ | Gen `auth/otp/send/route.ts:8-10`; 10-min expiry + single-use + ≤3/10min `:103-127`; session auth re-checks `used`/`expiry`/code in `src/auth.ts:55-63` | 4-digit OTP (~9k combos); no per-account verify-attempt lockout |
| 2 | Multi-account access + switching | ✅ | `BusinessAccountMember` `schema.prisma:1260`; switch validates membership `auth/switch-business-account/route.ts:29-33`; JWT rotates `activeContext.ts:46-195` | `availableAccounts` capped at 20 |
| 3 | Role-based permissions (UI + server) | ✅ | Engine `lib/permissions/engine.ts`; registry `registry.ts:12-41`; enforced on role-create, team-add, **price-edit** (`vendor/products/[id]/route.ts:64`) | Empty-perms UI fallback shows all links (server still blocks) |
| 4 | Company-level user grouping | ✅ | `BusinessAccount` tenancy root + `BusinessAccountMember`; auto-provisioned at signup `auth.service.ts:64-73` | — |
| 5 | User Types (SuperAdmin/Internal/Brand/Distributor/Vendor/Customer teams) | 🟡 | Scoped templates seeded; SuperAdmin distinct (`auth.ts:341-347`) | **No distinct "Distributor" actor** (distributor = vendor); `delivery` scope defined but unseeded |
| 6 | One company, multiple users (invite + roles) | ✅ | Invite flows create membership + UserRole + email creds (account/vendor/brand/admin) | — |
| 7 | Mobile-first login UI | ✅ | `login/LoginPageInner.tsx:192` mobile base + `md:` upgrades; `inputMode` set | Uses fixed `px` not project's `clamp()` convention (cosmetic) |
| 8 | Permission hierarchy | ✅ | TeamRole enum + JSON scopes union-merged `engine.ts:32-43` | Dual model (enum + JSON) runs in parallel — drift surface |

**Notes / risks:** 4-digit OTP entropy + no verify-attempt lockout (only IP send-limit); recommend 6-digit + attempt counter. The standalone `auth/otp/verify` route is unauthenticated but its only consumer (`vendor/onboarding/submit`) refuses if a user with that phone already exists, so no takeover. Decide whether "vendor = distributor" satisfies the Distributor requirement.

---

## 5. Requirement 2 — Customer Management

**Verdict: 🔴 Not ready.** Plumbing (outlet-keyed ordering, bulk import with row-errors, DB-backed filters, bulk tagging) works, but the **profile attribute set is ~30% covered** and the admin customer detail UI hides most fields the API supports.

**Profile fields:** Business Name ✅, GST ✅, Assigned Salesperson ✅, Manual Tags ✅, Notes ✅, Primary Contact/Mobile/Email ✅, Credit Enabled/Limit ✅. **Partial:** Trade Name (reuses `displayName`), PAN/FSSAI/Billing (in DB + import + PATCH API but **not in admin detail UI**), Business Type (free-text, hardcoded `'customer'`), Area/City/State, Platform Status. **Missing (no column):** Sub-Type, Cuisine/Category, Business Size, Business Structure, Service Model, Monthly Purchase Band, Procurement Frequency, Designation, Lead Status, Credit Type, AI Tags, Behaviour Tags.

**Outlets:** multiple outlets ✅, outlet-wise addresses ✅, **outlet-wise ordering ✅** (cart unique `(userId, businessAccountId, outletId)`; order stamps `outletId` + `deliveryAddressSnapshot`; checkout blocked if outlet address incomplete — `order.service.ts:54-56`).

**Bulk:** Upload ✅ (preview/commit + per-row Zod errors, `excel.service.ts:538`), **Update 🟡** (whitelist only — see P0-6), Tagging ✅ (but requires a `vendorId` mapping).

**Filters:** Area ✅, Pincode ✅, Sales Executive ✅, Credit Status ✅ (all hit DB WHERE in `admin/users/route.ts:59-111`). **Attributes 🔴** — cannot filter by size/cuisine/lead-status because the columns don't exist.

**Blocking gaps:** P0-4 (13 missing attributes), `businessType` hardcoded, admin customer detail page only edits 6 flat fields (PAN/FSSAI/billing/outlets/credit invisible — `admin/customers/[id]/page.tsx:91-95`), bulk-update not "any field."

**Risks:** Customer CRM attributes (tags/salesperson/territory/notes/credit) are scoped **per-vendor** (`VendorCustomer`), not global — so admin filters silently match nothing for customers with no vendor mapping. Tags are one untyped `String[]` (Manual/AI/Behaviour collapsed). No dedicated `admin/customers` API — layered on `/admin/users?role=customer`.

---

## 6. Requirement 3 — Brand & Vendor Management

**Verdict: 🟠 Needs work.** The engine (brand catalog CRUD, real many-to-many distributor mapping, multi-distributor storefront with per-vendor pricing/stock, rich vendor onboarding) is real and persists. Two go-live gaps: brand login dead-ends, and the vendor master admin view omits KYC/bank/assigned-brands.

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Brand Login → portal | 🟡 | RBAC real (`middleware/rbac.ts:39`), portal gated (`brand/portal/layout.tsx:99`), but login redirect + navbar give no entry point (B-8) |
| Brand Dashboard | ✅ | `brand/portal/page.tsx:54-124` (live profile + products + stats) |
| Brand Catalog | ✅ | Full CRUD persists `brand.service.ts:515-600` |
| Brand Visibility | 🟡 | Public list filters `isActive + approved` `brand.service.ts:72`; no granular public/restricted toggle beyond approval |
| Brand→Distributor (1→many) | ✅ | Real M2M `BrandProductMapping` `schema.prisma:964`; auto-mapping engine `brand-mapper.ts:179-494` |
| Same item, multiple distributors | ✅ | Brand store aggregates `distributors[]` `brand.service.ts:170-228`; vendor picker UI. (Standard PDP shows other distributors only when OOS) |
| Different pricing per distributor | ✅ | Per-mapping `basePrice + slabs` `brand.service.ts:175,199` |
| Different stock per distributor | ✅ | Per-vendor `inventory.qtyAvailable` `brand.service.ts:137,202` |
| Vendor onboarding (PAN/FSSAI/auth person/pickup) | ✅ | Zod wizard persists all `vendor/onboarding/submit/route.ts:30-222` |
| Vendor master: GST | ✅ | Shown in admin (reads `user.gstNumber`) |
| Vendor master: Bank details | 🔴 | Stored + editable in settings, but admin detail **doesn't fetch/show** (P0-7) |
| Vendor master: Operational status | ✅ | Admin verify/revoke/reject `admin/vendors/[id]/route.ts:89-145` |
| Vendor master: City/Pincode coverage | ✅ | ServiceAreas shown `admin/vendors/[id]/page.tsx:690-734` |
| Vendor master: Assigned Brands | 🔴 | No `vendor.assignedBrands` relation; link is implicit via product mappings only |
| Vendor master: KYC display | 🔴 | PAN/FSSAI/trade name/auth person/pickup collected but never shown to admin (P0-7) |

**Notes:** "Assigned Brands" is not first-class — needs a model field + admin assignment UI if the spec requires explicit authorization. Auto-mapping quality depends on embedding/LLM provider env config (degrades to rules-only if unset — verify prod env). Brand rejection notes aren't persisted (audit-log only). `BrandDistributorInvite` is a lead form, **distinct** from the mapping engine (working as designed).

---

## 7. Requirements 4 & 5 — Item & Category Management

**Verdict: 🔴 Not ready.** Category 2-level tree is correctly enforced and bulk ops exist, but there is **no true Horeca1 central SKU** (P0-1), the mandatory item→sub-category rule isn't enforced, "Mapped Vendors" is a heuristic, alias names aren't searched, bulk-update can't touch "any field" (P0-6), and the veg-enum bug (B-1) is live.

**Item master:** Central Horeca1 SKU 🔴 (P0-1) · Name ✅ · Alias Names 🟡 (stored, not searched — B-6) · Brand ✅ (free-text, no FK) · UOM ✅ · Tax % ✅ · Images ✅ · Active/Inactive ✅ · Search Keywords 🟡 (`tags` searched, `aliasNames` not).

**Item page:** Details ✅ · Mapped Vendors 🟡 (name-dedup + OOS alternates heuristic, not an explicit map) · Mapped Categories ✅ (`ProductCategory` multi-category w/ `isPrimary`) · Pricing Visibility ✅ · Stock Visibility ✅.

**Bulk:** Upload ✅ (row-level validation + preview/commit + backup) — but fixed column set (can't import aliasNames/tags/isActive/multi-category) · Update 🟡 (whitelist) · **Update ANY field 🔴** (P0-6).

**Category:** 2 levels ✅ (POST/PATCH guard self-loop + grandchild) — but **import bypasses the guard** (B-3) · Sub-category multi-parent 🟡 (single `parentId` FK — multi-parent impossible) · **Item mandatory sub-category 🟡** (`categoryId` optional everywhere; products can save with zero categories; no leaf-level enforcement).

**Blocking gaps:** P0-1 (no central SKU — the largest gap), P0-6 (bulk "any field"), item→sub-category not mandatory/leaf-constrained.

**Risks:** B-1 (veg enum crash), B-3 (import depth bypass), B-6 (alias search). "Mapped Vendors" being a heuristic is a direct consequence of P0-1. Multi-parent sub-categories need a join table if that rule is firm.

---

## 8. Requirement 6 — Pricelist Management

**Verdict: 🟠 Needs work.** Architecture is strong and the resolved price genuinely flows into cart + checkout. Two of seven assignment dimensions are unmet: **Brand** is wired but never matches (P0-5), **Distributor** isn't a first-class type.

**Unlimited pricelists** ✅ (no cap; only `@@unique([vendorId, name])`).

**Assignment rules:** Customer ✅ · Outlet ✅ · Pincode ✅ · Area ✅ (brittle free-text city/state equality) · Segment ✅ (tag-based) · **Brand 🔴** (P0-5 — dead path) · **Distributor 🔴** (no enum value; satisfied only under "pricelist is owned by the distributor/vendor" interpretation — **needs a product-owner decision**).

**Pricing types:** Fixed ✅ · Discount % ✅ · Special ✅ (functionally identical to fixed; badge unused) · Scheme ✅ (price-break half works; **`schemeFreeQty` free-goods half is dead — B-5**).

**Bulk:** Upload ✅ (≤2000 rows, SKU→productId scoped, per-row errors, all-or-nothing tx, all 4 types) · Update ✅ (upsert re-upload + separate `bulk-price` %/fixed adjust).

**Resolution priority** is well-designed (outlet → customer → segment → pincode → area → brand → legacy → per-product → slab → base), uses `Prisma.Decimal` (no float drift), and **recomputes at checkout inside the order tx** (`order.service.ts:142-152`) — tamper-resistant. First-match-wins within a type has no tie-break (non-deterministic on ties, rare).

---

## 9. Requirement 7 — Order Management

**Verdict: 🔴 Not ready.** Core checkout, the guarded vendor status machine, partial fulfilment, and outlet-stamped ordering are production-grade. But three must-haves are non-functional in the UI (Repeat Order, Draft PO, Order Notes), the **entire Internal Controls block is missing** (P0-2), and the **admin status override bypasses the state machine + side-effects** (P0-3).

| Requirement | Status | Notes |
|-------------|--------|-------|
| Cart → one PO per vendor | ✅ | Vendor-grouped, Serializable tx `order.service.ts:67,247` |
| Checkout | ✅ | Razorpay + credit + wallet; minor: bank_transfer/po_number UTR captured client-side but not sent |
| Repeat Order | 🟡 | Robust server `reorder` (`order.service.ts:360-407`) is **dead code**; UI uses fragile client-side `addToCart` that drops items missing from locally-loaded catalog |
| Draft PO | 🔴 | `draft` enum + transitions exist but **nothing creates a draft** — `create()` hardcodes `pending` (`order.service.ts:255`); no save/submit endpoint |
| Outlet-wise ordering | ✅ | Stamped `outletId` + `deliveryAddressSnapshot` |
| Order Notes | 🟡 | Backend fully supports + displays, but **no capture UI** in cart/checkout — field is permanently empty from storefront |
| Status flow | ✅ vendor / 🔴 admin | Guarded `VALID_TRANSITIONS` for vendor; **admin PATCH bypasses it** (P0-3) |
| Edit Orders | 🔴 | No edit-line endpoint anywhere |
| Split Orders | 🔴 | No split endpoint/permission/UI |
| Reassign Vendors | 🔴 | `vendorId` set only at creation, never mutated |
| Modify Quantities | 🟡 | Reduce-only, `pending`-only (partial-accept); no increase, no admin qty edit |

**Client status mapping:** Pending=`pending` ✅ · Approved=`confirmed` ✅ (vendor "Accept") · Processing=`processing` ✅ · Dispatched=`shipped` ✅ · Delivered=`delivered` ✅ · Cancelled=`cancelled` ✅. Extra states `partially_delivered`/`returned` exist but have no driving UI (returns go via separate `ReturnRequest`).

**Positive:** MOV enforcement, IST-aware slot-cutoff, partial-fulfilment inventory math, credit debit/reversal on confirm/cancel, outlet address snapshot — all correct and well-guarded.

---

## 10. Code Health Detail — ESLint Errors (9)

Build ignores these, but they should be fixed; B-2 is a real bug.

| File:Line | Rule | Note |
|-----------|------|------|
| `next.config.ts:50` | `ban-ts-comment` | use `@ts-expect-error` not `@ts-ignore` |
| `src/app/order-success/page.tsx:29` | set-state-in-effect | cascading renders |
| `src/app/vendor/(dashboard)/dashboard/page.tsx:264` | set-state-in-effect | cascading renders |
| `src/app/vendor/(dashboard)/dashboard/page.tsx:275` | no-html-link-for-pages | `<a>`→`<Link>` for `/vendor/setup/` |
| `src/app/vendor/(dashboard)/dashboard/page.tsx:312` | set-state-in-effect | cascading renders |
| `src/app/vendor/[id]/page.tsx:132` | no-explicit-any | type it |
| **`src/components/auth/OutletCompletionBanner.tsx:33`** | **rules-of-hooks** | **`usePathname` called conditionally — real bug (B-2)** |
| `src/components/features/homepage/VendorRollups.tsx:86` | no-explicit-any | type it |
| `src/components/features/homepage/VendorRollups.tsx:173` | no-explicit-any | type it |

Plus **297 warnings** (mostly `<img>`-not-`<Image>` in admin/brand pages + unused vars).

---

## 11. Recommended Path to Go-Live

Suggested ordering (close P0s first; many are 1–2 day items, P0-1 is larger):

**Phase A — data-model fixes (do first, they unblock UI):**
1. **P0-1 / P0-4:** Decide the item-master model. Either (a) introduce a Horeca1-owned `MasterItem` (canonical SKU) that vendor `Product`s map to, or (b) formally accept "per-vendor product + brand-mapping" as the master and document it. Add the ~13 missing customer attributes (a `customerProfile` JSON column or dedicated columns) + stop hardcoding `businessType`.
2. **P0-5:** Fix brand pricelist assignment — map `brandId`→name server-side, or FK-link `Product.brand` to `Brand`.

**Phase B — ops workflows (Order Management):**
3. **P0-3:** Route admin status changes through `OrderService.updateStatus` (or an explicit audited override that runs the same stock/credit side-effects).
4. **P0-2:** Build Edit / Split / Reassign / Modify-Qty endpoints + UI + `orders.split`/`orders.reassign` permissions.
5. Wire the existing `reorder` endpoint to the UI; add Order Notes capture in cart/checkout; implement Draft PO save/submit.

**Phase C — masters & bulk:**
6. **P0-6:** Widen bulk-update to cover the full editable field set (or explicitly scope what "any field" means).
7. **P0-7:** Add bank/PAN/FSSAI/auth-person/pickup + assigned-brands to the admin vendor detail GET + page.
8. Fix B-8 (brand login redirect + navbar entry).

**Phase D — bugs & polish:**
9. Fix B-1 (veg enum), B-2 (conditional hook), B-3 (import depth), B-4 (missing event listeners), B-5 (`schemeFreeQty`), B-6 (alias search), B-7 (brand team GET gate).
10. Harden OTP (6-digit + verify-attempt lockout). Clean the 9 lint errors. Update CLAUDE.md's inaccurate "0 lint errors" line.

**Then** proceed to Credit / Wallet / DiSCCO (next phase, out of scope here).

---

## 12. Decisions Needed From Product Owner

1. **Item master:** true central Horeca1 SKU, or accept per-vendor products as the master? (Drives P0-1 scope.)
2. **Distributor:** is "vendor = distributor" acceptable for the User-Type and Pricelist-assignment requirements, or is a distinct Distributor actor required?
3. **Customer attributes:** are all ~30 master-datasheet fields hard launch requirements, or is a subset acceptable for v1?
4. **Scheme pricing:** is "buy X get Y free" (`schemeFreeQty`) in scope, or is the price-break-only behavior sufficient?
5. **Internal controls:** are Edit/Split/Reassign all required for go-live, or can some defer post-launch?

---

*Audit produced by automated multi-agent code review (6 domain agents + build-health checks). Every status claim above is backed by a `file:line` reference in the codebase. Re-run after fixes to regenerate the scorecard.*

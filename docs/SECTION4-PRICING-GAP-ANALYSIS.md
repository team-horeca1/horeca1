# Section 4 — Pricing, Bulk Pricing & Pricelists  
## Gap analysis (codebase vs brief)

**Date:** 2026-07-27  
**Scope note:** Brief said *“tackle pricelists later; right now only the 1st two.”* This doc still scores **every** brief item so nothing is missed. Pricelist flows are marked **Shipped (brief-deferred)** when code already exists.

**Pricing priority (recommendation — already live):**

1. Customer-specific / pricelist price  
2. Bulk `PriceSlab` (if qty qualifies)  
3. Default `Product.basePrice`  

Implemented once in `src/modules/pricing/pricing.service.ts` → `resolveUnitPrice`, reused by cart, order, catalog (`attachCustomerPricing`).

**UX path delta:** Brief says `Pricing >> …`. Live path is usually **Products → Select Product → Pricing & GST / Bulk pricing tiers**, plus **Price Lists** nav for customer prices, and Bulk Engine / product import for bulk updates. There is no separate top-level “Pricing” workspace.

---

## Objectives

| # | Brief | Verdict | Evidence / gap |
|---|--------|---------|----------------|
| O1 | Every Online Store Product has a Selling Price | **Pass** | `Product.basePrice` required on publish; store-scoped via `vendorId` |
| O2 | Products can have Bulk Pricing | **Pass** | `PriceSlab` model + product form tiers (UI ≤3) |
| O3 | Suppliers can create Customer-specific Pricelists | **Shipped (brief-deferred)** | `/vendor/price-lists` + APIs |
| O4 | Update prices individually or via Bulk update | **Partial** | Individual edit Pass; bulk via import / Bulk Engine / `bulk-price` — no dedicated price-only Excel |

---

## Core philosophy

| Statement | Verdict | Notes |
|-----------|---------|-------|
| Pricing belongs to an Online Store Product | **Pass** | `Product.vendorId` + outlet/store context |
| Same product may differ across Online Stores | **Pass** | Separate `Product` rows per vendor/store |
| Same product may differ per Customer (Pricelists) | **Pass** | `PriceList` / assignments / `VendorCustomerPrice` |

---

## Developer rules

| Rule | Brief | Verdict | Evidence / gap |
|------|--------|---------|----------------|
| R1 | Pricing on Online Store Product; one Default Selling Price | **Pass** | `basePrice` |
| R2 | Multiple Bulk Pricing slabs | **Pass** | `PriceSlab[]`; UI max 3; **API Zod `.max(3)`** |
| R3 | One Customer may have a different Price | **Pass** | Pricelists + `VendorCustomerPrice` |
| R4 | Customer-specific Price overrides Default | **Pass** | Resolver; also overrides bulk |
| R5 | Bulk Price only if qty qualifies | **Pass** | `minQty` match in `resolveUnitPrice` |
| R6 | Bulk Price Updates only update Pricing | **Pass** | `%` bulk-price + **Replace Prices** price-only Excel |
| R7 | Every Price Change → Price History | **Pass** | Dedicated `PriceHistory` table; dual-write from product edits + pricelist workspace/bulk; product + customer history UIs |

---

## UI/UX flows

### Default pricing (1–3)

| # | Flow | Verdict | Where |
|---|------|---------|-------|
| 1 | Add Selling Price | **Pass** | Products → product → Pricing & GST → Taxable (ex-GST) → Save |
| 2 | Edit Selling Price | **Pass** | Same |
| 3 | View Product Price | **Pass** | Product list + edit panel |

### Bulk pricing (4–7)

| # | Flow | Verdict | Where |
|---|------|---------|-------|
| 4 | Add Bulk Pricing slab | **Pass** | Products → Bulk pricing tiers |
| 5 | Multiple slabs (example 1–11 / 12–47 / 48+) | **Pass** | UI up to 3 slabs |
| 6 | Edit Bulk Pricing | **Pass** | Same form; PATCH replaces slabs |
| 7 | Delete Bulk Pricing slab | **Pass** | Remove tier → Save |

### Customer-specific pricelists (8–12) — brief deferred; code shipped

| # | Flow | Verdict | Where |
|---|------|---------|-------|
| 8 | Create Customer Pricelist | **Shipped** | `/vendor/price-lists` → Create |
| 9 | Assign Customer to Pricelist | **Shipped** | Pricelist detail + Customers `priceListId` |
| 10 | Assign Product Prices | **Shipped** | Pricelist detail / workspace |
| 11 | Edit Customer Price | **Shipped** | Same |
| 12 | Remove Customer Price | **Shipped** | Remove item / clear cell |

### Bulk price update (13–15, 18)

| # | Flow | Verdict | Where / gap |
|---|------|---------|-------------|
| 13 | Download Price Update Template | **Pass** | `GET .../products/price-update?template=true` |
| 14 | Bulk Price Upload validate/apply | **Pass** | Replace Prices + price-update API |
| 15 | Correct Upload Errors | **Pass** | Error report CSV |
| 18 | Replace Prices | **Pass** | Products → **Replace Prices** |

### Price history (22–23)

| # | Flow | Verdict | Where / gap |
|---|------|---------|-------------|
| 22 | View Price History (product) | **Pass** | Product edit panel → Price history from `PriceHistory` |
| 23 | View Customer Price History | **Pass** | Customers → history icon → pricelist price changes |

### Price search / filter (24–25)

| # | Flow | Verdict | Where / gap |
|---|------|---------|-------------|
| 24 | Search Product Pricing | **Pass** | Products search (name/SKU/brand) |
| 25 | Filter Brand / Category / Customer Pricelist | **Partial** | Brand + Category on Products; pricelist filter Missing |

### Price calculation (26–28)

| # | Flow | Verdict | Where |
|---|------|---------|-------|
| 26 | Customer opens product → applicable price | **Pass** | Resolver + card/PDP (`attachCustomerPricing`) |
| 27 | Qty change → recalc bulk | **Pass** | Card/cart; PDP live headline weaker |
| 28 | Checkout final amount | **Pass** | Cart/order use `resolveUnitPrice` |

### Price status (29)

| # | Flow | Verdict | Where |
|---|------|---------|-------|
| 29 | No Product Pricing → not for sale | **Partial** | Publish requires `basePrice > 0`; DB column required (no null); no separate “No Price Provided” empty state beyond draft/invalid |

---

## Expected outcomes

| Outcome | Verdict |
|---------|---------|
| Every Online Store Product has Default Selling Price | **Pass** (approved/published) |
| Bulk Pricing works | **Pass** |
| Customer-specific Pricelists override Default | **Pass** (shipped) |
| Complete Price History maintained | **Pass** |

---

## End goal checklist

| Understanding | Status |
|---------------|--------|
| Every Product must have Default Selling Price | Clear + enforced on publish |
| How Bulk Pricing works | Clear + live |
| How Customer-specific Pricelists work | Clear + live (brief said later) |
| How Bulk Price Updates work | Live but fragmented (import / engine / %) |
| How System determines Final Selling Price | Single resolver; priority correct |
| Pricing independent of Inventory | **Pass** by design |

---

## What’s missing — simple words

1. Pricelist filter on Products not built (Brand + Category filters are live).  
2. Playwright — `e2e/vendor-pricing-section4.spec.ts` covers slab cap, price template, PriceHistory (22–23).

**Closed this pass:** Dedicated `PriceHistory` table + dual-write; product Price history panel; customer Price history modal (flow 23).

---

## Recommended follow-ups (priority)

| P | Item | Effort | Status |
|---|------|--------|--------|
| P0 | Cap `priceSlabs` `.max(3)` | S | **Done** |
| P1 | Log price changes + Change history UI | M | **Done** (ProductAuditLog + PriceHistory) |
| P1 | Dedicated `PriceHistory` model (G31) | M | **Done** |
| P2 | Price-only Excel + Replace Prices | M | **Done** |
| P2 | Brand/category filters on products | S | **Done** |
| P3 | Customer-centric price history page (flow 23) | M | **Done** |
| — | Pricelist filter on Products | S | Open |

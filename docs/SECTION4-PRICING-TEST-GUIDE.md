# Section 4 — Pricing & Bulk Pricing  
## Manual Testing Guide (non-developer friendly)

**Login (supplier):** `fresh@dailyfreshfoods.com` / `vendor123`  
**Login (customer):** `chef@tajpalace.com` / `customer123`  
**Path:** Supplier Dashboard → Business → Select Online Store → **Products** (and **Price Lists** for customer prices)

**Known path wording:** The brief says “Pricing >> …”. On Horeca1 the selling price and bulk slabs live on each **Product** (Pricing & GST + Bulk pricing tiers). Customer pricelists are under **Price Lists**.

**Pricing priority (do not treat as a bug):**

1. Customer-specific / pricelist price (highest)  
2. Bulk slab price (if quantity qualifies)  
3. Default selling price (`basePrice`)

---

## Simple: what’s missing / partial (don’t miss)

1. Pricelist filter on Products not built (Brand + Category filters are live).
2. Playwright — `e2e/vendor-pricing-section4.spec.ts` covers slab cap, price template, PriceHistory (22–23).
3. Pricelist filter on Products not built (Brand + Category filters are live).  
4. Automated tests — `e2e/vendor-pricing-section4.spec.ts`.

**Closed this pass:** API slab cap (3), price audit logging, Change history rows, Replace Prices + price-only Excel, Brand/Category filters.

Full scorecard: [`SECTION4-PRICING-GAP-ANALYSIS.md`](./SECTION4-PRICING-GAP-ANALYSIS.md).

---

## Objectives checklist

| # | Brief | Where to test | Pass if |
|---|--------|---------------|---------|
| O1 | Every product has Selling Price | Products → open product → Pricing & GST | Taxable (ex-GST) filled; Save works |
| O2 | Bulk Pricing | Same → Bulk pricing tiers | Can add up to 3 qty/price slabs |
| O3 | Customer Pricelists | **Price Lists** (shipped; brief deferred) | Create list, assign customer, set special price |
| O4 | Individual or Bulk update | Product edit; Bulk Engine; product import; Settings % tools | Price changes without editing inventory |

---

## Rules (spot-check)

| Rule | How to verify |
|------|----------------|
| R1 Default price on store product | Two stores can have different prices for “same” SKU |
| R2 Multiple slabs | Add 3 tiers, Save, reopen — still there |
| R3–R4 Customer override | Price Lists → special price → customer sees that price (not slab) |
| R5 Slab by qty | Customer cart: qty 5 → high unit; qty 50 → lower unit (if no pricelist) |
| R6 Bulk updates only pricing | Prefer `%` bulk-price or price columns in import — avoid stock columns |
| R7 Price history | Audit API exists; UI incomplete — expect Partial |

---

## Flows 1–7 — Default + Bulk (primary)

| # | Steps | Pass if |
|---|--------|---------|
| 1–3 | Products → product → enter/edit/view selling price → Save | Price persists after reload |
| 4–5 | Add slabs e.g. 1–11 @100, 12–47 @95, 48+ @90 → Save | All three saved |
| 6 | Edit a slab price → Save | New price shown |
| 7 | Delete a slab → Save | Slab gone |

## Flows 8–12 — Pricelists (already shipped)

| # | Steps | Pass if |
|---|--------|---------|
| 8 | Price Lists → Create | List appears |
| 9 | Assign customers | Customer linked |
| 10–12 | Set / edit / remove special product price | Customer price changes; cart uses it |

## Flows 13–15, 18 — Bulk price update

| # | Steps | Pass if |
|---|--------|---------|
| 13 | Products → Import → Download template | Excel downloads (full product template, not price-only) |
| 14–15 | Upload bad row → error report → fix → re-upload | Errors listed; retry works |
| 18 | Bulk Engine / set price / import update | Prices replaced; inventory unchanged if you only touch price fields |

## Flows 22–25 — History / search

| # | Steps | Pass if |
|---|--------|---------|
| 22 | Product → Change history | May be empty stub — Partial |
| 23 | Price Lists workspace cell history | Some history on cells; no full customer page |
| 24–25 | Products search | Name search works; brand/category/pricelist filters for Pricing Missing |

## Flows 26–29 — Customer calculation / status

| # | Steps | Pass if |
|---|--------|---------|
| 26–27 | Open product / change qty on card | Price updates with slab or customer price |
| 28 | Checkout | Payable matches cart unit prices |
| 29 | Try publish without price | Blocked / validation error |

---

## Playwright (automated)

```bash
# App must be on :3000 (Docker app-dev)
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
npx playwright test e2e/vendor-pricing-section4.spec.ts --workers=1
```

Covers: products page, basePrice + 3 slabs, cart qty slabs, bulk-price API, import template probe, audit endpoint, price-lists smoke.

**Last result:** 7/7 passed × 2 runs (2026-07-27).

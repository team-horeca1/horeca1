# Section 3 — Inventory & Price Management  
## Manual Testing Guide (non-developer friendly)

Use this checklist to verify every point in the Section 3 brief.  
**Login:** `fresh@dailyfreshfoods.com` / `vendor123`  
**Path:** Supplier Dashboard → Business → Select Online Store → **Inventory**

**Known intentional difference (Rule 5):** stock is **reserved when the order is placed** (not only after payment), and **sold when delivered**. Cancel releases reserved stock. This prevents overselling. Do not treat this as a bug unless product owners change the rule.

---

## Why Brand / Your POS SKU were empty on Edit Product

Seed data used to create products **without** filling `brand` and `vendorSku` (POS SKU).  
Catalog SKU like `H1-SEED-0063` comes from the master catalog, not from “Your POS SKU”.

**After the seed fix, each product should have:**
- **Brand** = vendor name (e.g. Daily Fresh Foods / Green Valley Organics)
- **Your POS SKU** = `POS-00xx`
- **Catalog SKU** = `H1-SEED-00xx`
- **Tags** = category slug + city (for Tags filter)

**How to check:** Inventory → search by brand, or Products → Edit Product → Brand and Your POS SKU filled.

---

## Objectives (end of section)

| # | Brief text | Where to test | Pass if |
|---|------------|---------------|---------|
| O1 | Products have Available Stock | Inventory table → **Available** column | Numbers show; can edit with + / − |
| O2 | Products can be Restocked / Update Inventory | Row → **Restock** or + on Available | Qty increases; toast or value updates |
| O3 | Updated individually or in Bulk | Edit one row; or **Bulk Upload** | Single save works; bulk import updates |
| O4 | Marked Out of Stock | Row → **Mark OOS** | Available = 0; Status **Out** |
| O5 | Stock updated during Order Fulfilment | Place COD order as customer; vendor **Log** | See `order_reserve`; after cancel see `order_release`; after deliver see `order_finalize` |

---

## Core philosophy & developer rules

| # | Brief text | Where to test | Pass if |
|---|------------|---------------|---------|
| P1 | Every Online Store maintains its own Inventory | Inventory header text | Shows “Stock for this Online Store only” |
| P2 | Online Store = Stock Location | Switch store from Businesses, open Inventory again | Stock list is for that store only |
| R1 | Inventory never at Business level; one store never affects another | Two stores / same product if multi-store | Changing qty in Store A leaves Store B unchanged |
| R2 | Stock can be zero; product stays in catalog | Mark OOS | Product still listed; Status Out; customer cannot buy |
| R4 | Inventory in Selling Units | Available qty | Whole numbers (kg / pack units as product unit) |
| R5 | Reduce only after customer pays | See note at top | Reserved at order create (intentional) |
| R6 | Real-time Available Stock | Change qty; refresh / watch Net | Net = Available − Reserved updates |

---

## UI/UX flows

### Inventory setup

| Flow | Steps | Pass if |
|------|-------|---------|
| **1 Open Inventory** | Business → Online Store → Inventory | Page title **Inventory**; stock table loads |

### Daily inventory

| Flow | Steps | Pass if |
|------|-------|---------|
| **4 Increase Stock** | Click **+** on Available (or type higher number) | Available goes up after ~1s autosave |
| **5 Reduce Stock** | Click **−** | Available goes down (not below 0) |
| **6 Stock Adjustment** | Type exact Available number | Value saved; Net updates |
| **7 Restock Product** | Click **Restock** | Qty increases (adds +20); product can be ordered again |
| **8 Mark Out of Stock** | Click **Mark OOS** | Available = 0; Status **Out**; customer cannot order |
| **9 Enable Product Again** | **Restock** or set Available > 0 | Status OK / Low; ordering allowed again |

### Bulk inventory

| Flow | Steps | Pass if |
|------|-------|---------|
| **10 Download Template** | **Bulk Upload** → **Download template** | Excel file downloads |
| **11 Bulk Update** | Upload filled Excel → Import | Toast shows updated count |
| **12 Correct Upload Errors** | Upload bad SKU → Download error report (if errors shown) | Error file / skipped rows; fix and re-upload works |

### Search & filter

| Flow | Steps | Pass if |
|------|-------|---------|
| **13 Search** | Type SKU / product name / brand in search | Matching rows only |
| **14 Filter** | Use **All brands** / **All categories** / **All tags** + tabs All / Low Stock / Out of Stock | List narrows correctly |

### Low stock

| Flow | Steps | Pass if |
|------|-------|---------|
| **15 Configure Low Stock** | Click **Threshold** number → change → Enter | Value saves |
| **16 Low Stock Notification** | Set Available ≤ threshold | Row shows **Low**; Low Stock tab; vendor may get in-app “Low Stock Alert” |
| **17 Out of Stock** | Mark OOS or set Available 0 | Status **Out**; ordering disabled for that stock |

### Inventory during orders

| Flow | Steps | Pass if |
|------|-------|---------|
| **18 Customer places order** | Customer adds item with stock → checkout COD | Order created |
| **19 Stock reservation** | After order placed → vendor Inventory **Log** | History reason contains `order_reserve`; Reserved up / Net down |
| **20 Order cancelled** | Vendor cancels order | History `order_release`; Reserved down |
| **22 Order delivered** | Move order to delivered | History `order_finalize`; Available down |

### Product availability

| Flow | Steps | Pass if |
|------|-------|---------|
| **26 Available** | Stock Net > 0 and product active | Customer can add to cart |
| **27 Out of Stock** | Net = 0 | Shown as Out (or hidden with pincode hard-hide); cannot order |
| **28 Disable Ordering** | Inventory → **Disable ordering** | Button becomes Enable; product inactive for storefront |
| **29 Enable Ordering** | **Enable ordering** | Product orderable again |

### Export

| Flow | Steps | Pass if |
|------|-------|---------|
| **32 Export** | Click **Export** | Excel/CSV downloads |

---

## Expected system outcomes

| Outcome | How to confirm |
|---------|----------------|
| Every Online Store has its own Inventory | Header + R1 test |
| Real-time Available Stock | O1 + R6 |
| Individual or Bulk update | O3 |
| Low Stock Alerts work | Flow 15–16 |
| OOS cannot be ordered | Flow 8 + 17 + customer cart |
| Auto-update on fulfilment | Flows 19–20, 22 + Log |
| Every stock movement recorded | Click **Log** after any change |
| Complete Inventory History | **Log** lists old → new + reason codes |

---

## What you should NOT see on Inventory (removed extras)

- **Count** (physical stock-take) — not in this brief  
- **Adjust reason** text box — not in this brief  

You **should** still see **Log** (history) because Expected Outcomes require recorded movements.

---

## Suggested full walkthrough (30–40 min)

1. Login as vendor → open Inventory (Flow 1).  
2. Increase / reduce / adjust one product (4–6).  
3. Mark OOS → confirm Status Out → Restock (8–9).  
4. Set low-stock threshold; open Low Stock tab (15–16).  
5. Search by brand; filter category + tag (13–14).  
6. Bulk Upload → download template → import bad SKU → note skipped (10–12).  
7. Export (32).  
8. Disable ordering → try customer buy (should fail) → Enable ordering (28–29).  
9. As `chef@tajpalace.com` / `customer123`, place COD order meeting MOV → vendor Log shows reserve → cancel → release (18–20).  
10. Optional: deliver an order → Log shows finalize (22).

Mark each row Pass / Fail on a printout of this guide.

---

## Automated coverage

Playwright: `e2e/vendor-inventory-section3.spec.ts`  
Run (app on `:3000`, DB seeded):

```bash
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
npx playwright test e2e/vendor-inventory-section3.spec.ts --workers=1
```

Re-seed after pulling seed changes:

```bash
npx tsx prisma/seed.ts
```

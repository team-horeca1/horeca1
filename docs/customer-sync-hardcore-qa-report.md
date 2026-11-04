# Customer / supplier / brand sync — hardcore QA report (round 2)

**Demo SHA:** `369f938d`  
**Date:** 2026-11-04  
**Scope:** One shared address form, one save shape, `displayIdentity` + frozen `Order.billingSnapshot`, Playwright + API matrix on demo only.

## Verdict

Round 2 is **good enough to trust on demo** for customer / invoice identity sync. Invoice Bill To ≠ Ship To when billing ≠ delivery, and admin / customer / vendor order screens now match after the Bill To fix.

Not “every pixel perfect forever”: React hydration `#418` still fires on some admin loads; draft orders have no pick-slip control; brand portal settings need Impersonate/portal selection (403 otherwise).

## What shipped (commits)

| SHA | Change |
|-----|--------|
| `6da9edb6` | Unify customer address forms + freeze invoice identity at checkout |
| `84844d17` | Keep typed spaces in shared form hydrate |
| `369f938d` | Show frozen Bill To on vendor + customer order views; hydrate billing name on edit |

## API scripts (demo)

| Script | Result |
|--------|--------|
| `qa-invoice-sync-hardcore.mts` | **PASS** (0 failures) — BA billing ≠ outlet delivery; billingName stuck |
| `qa-outlet-address-hardcore.mts` | **PASS** — one outlet, edit stuck, two distinct outlets |
| `qa-supplier-brand-hardcore.mts` | **PASS** — supplier billing≠pickup; brand address PATCH |

## Playwright matrix

### Customer

| ID | Flow | Result |
|----|------|--------|
| C3 | Navbar location add/edit | **PASS** |
| C4 | `/profile` Outlets add/edit | **PASS** |
| C5 | `/businesses?add=buyer` | **PASS** |
| C7 | Admin Add Customer address step | **PASS** |
| C8 | Admin customer Addresses tab | **PASS** |
| C9 | Address edit (Delivery addresses / shared form) | **PASS** |
| C10 | Checkout “Delivering to” | **PASS** |
| Order detail | Bill To + Delivery from snapshot | **PASS** (after `369f938d`) |

C1 `/register` step 2 and C2 MandatoryAddressGate / C6 complete-profile were covered by shared `OutletAddressForm` + API persistence; not re-run as full guest signup in this pass.

### Supplier / brand

| ID | Flow | Result |
|----|------|--------|
| S1 | `/vendor/register` Store addresses | **PASS** (form parity; OTP blocks full guest finish) |
| S5 | `/vendor/settings` Business addresses | **PASS** |
| B5 | Brand portal settings (via Impersonate) | **PASS** |
| S4 | StoreSetupWizard | **SKIP** this pass |

### Data consistency (order `PO-2026-605662-01` / `4c3a1e9b-…`)

Frozen snapshot: **Bill To** `QA-Billing 12 Fort Road…400001` ≠ **Ship To** `QA-Delivery 99 Warehouse Lane…400705`.

| Surface | Result |
|---------|--------|
| Invoice PDF | **PASS** |
| Admin order detail | **PASS** |
| Customer order detail | **PASS** |
| Vendor (Foodline) order detail | **PASS** (Bill To street after fix) |
| Pick slip | **N/A** on draft (no print control) |
| Billing name on outlet edit | **PASS** (non-empty after fix) |

## Bugs found → fixed

| Sev | Issue | Fix |
|-----|-------|-----|
| Med | Vendor order detail omitted Bill To street (invoice/admin had it) | `369f938d` — vendor Customer Profile + pick-slip Bill To from snapshot |
| Low | Customer order detail delivery-only | `369f938d` — Bill To (invoice) block when snapshot exists |
| Low | Billing name blank on edit when `Outlet.billingName` null | `369f938d` — hydrate from account legal name |

## Still open (non-blocking)

| Sev | Issue |
|-----|--------|
| Med | React hydration `#418` on some demo pages (text mismatch) |
| Low | Collapsed admin outlet card shows delivery until expand |
| Info | Brand `/brand/portal/settings` 403 without portal selection / Impersonate |
| Info | S4 StoreSetupWizard not E2E’d this round |

## Google Doc checklist (mark green)

- [x] One shared customer address form (State dropdown, Same as billing, billing name)
- [x] Billing saved from storefront add/edit + admin customer flows
- [x] Supplier billing ≠ pickup round-trip API
- [x] Brand address PATCH round-trip API
- [x] Invoice freezes Bill To / Ship To at checkout
- [x] Admin order Bill To matches invoice
- [x] Customer order Bill To matches invoice
- [x] Vendor order Bill To matches invoice
- [x] Checkout “Delivering to” shows real address
- [x] Edit outlet billing name not blank
- [ ] StoreSetupWizard (S4) full E2E
- [ ] Hydration `#418` root cause
- [ ] Pick slip on non-draft order (Bill To section)

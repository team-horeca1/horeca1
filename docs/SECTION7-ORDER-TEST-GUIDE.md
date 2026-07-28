# Section 7 — Order Management Test Guide

**Date:** 2026-07-28  
**Playwright:** `e2e/vendor-orders-section7.spec.ts`  
**Accounts:** vendor `fresh@dailyfreshfoods.com` / `vendor123` · customer `chef@tajpalace.com` / `customer123`

## How to run

```bash
$env:PLAYWRIGHT_SKIP_WEBSERVER=1
$env:PLAYWRIGHT_BASE_URL="http://localhost:3000"
npx playwright test e2e/vendor-orders-section7.spec.ts --project=chromium --workers=1
# Run twice for flake check
```

## Primary UI: Order Workspace

1. Nav **Orders** → `/vendor/orders` opens **Order Workspace** (not the old list).
2. Left: Cancel / Pending / Accepted / Packed / Ready for Dispatch queues.
3. Right: selected order workbench — lines, stock warnings, qty adjust, next status, invoice, cancel banner, customer notes/contact, activity.
4. **All orders** → `/vendor/orders?view=list` for filters, bulk, export.
5. **Full detail** still at `/vendor/orders/[id]` for picklist / e-way / proof.

## Playwright coverage (high level)

| Area | Covered |
|------|---------|
| Auto-accept, R12, partial, status, price lock | API + detail |
| Cancel request human UI | Customer + vendor |
| Bulk / export / payment filter | List `?view=list` |
| Reject reason + activity | Detail |
| Workspace primary + workbench process + All orders | Last test + IGST helper |

## Manual smoke

1. Process pending → Accepted from Workspace without opening full detail.  
2. Low-stock line: Accept N only / Apply substitute.  
3. Invoice button from workbench.  
4. No “Pending Approval” / no Accept Order approval gate.

See also: [SECTION7-ORDER-GAP-ANALYSIS.md](./SECTION7-ORDER-GAP-ANALYSIS.md)

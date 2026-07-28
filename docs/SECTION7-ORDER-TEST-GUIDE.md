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

## Primary UI: All orders list

1. Nav **Orders** → `/vendor/orders` opens **All orders** (filters, bulk, export).
2. Optional **Order Workspace** → `/vendor/orders?view=workspace` (3-zone queue / workbench / Activity).
3. **Full detail** still at `/vendor/orders/[id]` for picklist / e-way / proof.

## Playwright coverage (high level)

| Area | Covered |
|------|---------|
| Auto-accept, R12, partial, status, price lock | API + detail |
| Cancel request human UI | Customer + vendor |
| Bulk / export / payment filter | List (default) |
| Reject reason + activity | Detail |
| List primary + optional Workspace + IGST | Last test |

## Manual smoke

1. `/vendor/orders` shows All orders (not Workspace).  
2. Open Workspace from the list link (`?view=workspace`).  
3. Process pending → Accepted from list detail or Workspace.  
4. No “Pending Approval” / no Accept Order approval gate.

See also: [SECTION7-ORDER-GAP-ANALYSIS.md](./SECTION7-ORDER-GAP-ANALYSIS.md)

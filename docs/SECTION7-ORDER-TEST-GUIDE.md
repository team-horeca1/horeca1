# Section 7 — Order Management Test Guide

**Date:** 2026-07-28  
**Playwright:** `e2e/vendor-orders-section7.spec.ts` (8 tests)  
**Accounts:** vendor `fresh@dailyfreshfoods.com` / `vendor123` · customer `chef@tajpalace.com` / `customer123`  
**Last verified:** 8 passed ×2 (Chromium, `--workers=1`, `PLAYWRIGHT_SKIP_WEBSERVER=1`)

## How to run

```bash
# App on :3000 (Docker horeca1-app-dev)
$env:PLAYWRIGHT_SKIP_WEBSERVER=1
$env:PLAYWRIGHT_BASE_URL="http://localhost:3000"
npx playwright test e2e/vendor-orders-section7.spec.ts --project=chromium --workers=1
# Run twice for flake check
```

## Status mapping (brief → code)

| Brief | Filter / status |
|-------|-----------------|
| New | `?status=new` → `pending` + created within 2h |
| Pending | `pending` (auto-accepted; cancel OK) |
| Accepted | `confirmed` / `?status=accepted` |
| Partially Accepted | `?status=partially_accepted` → `isPartial` |
| Packed | `processing` / `?status=packed` |
| Ready for Dispatch | `ready_for_dispatch` |
| Dispatched | `shipped` / `?status=dispatched` |
| Delivered / Completed | `delivered` / `?status=completed` |
| Cancelled | `cancelled` |

## Playwright coverage

| Test | Maps to |
|------|---------|
| auto-accept on place + events + New/Pending filters | Platform rule, flows 1–5, R3/R9/R15, filters |
| R12 cancel only while pending | Rule 12, flows 8/17 |
| partial fulfilment + OrderEvents + invoice qty | Flows 9–11, R14, events |
| status advances → Delivered + events | Flows 12–16, R5 |
| price lock at placement | Rule 11 |
| human UI: customer cancel request → vendor approve | Flow 18 |
| human UI: bulk status + export + payment method filter | Flows 30, 32–34 |
| human UI: reject line with typed reason + activity log | Flow 10 polish |

## Manual UI smoke

1. `/vendor/orders` — tabs New / Pending / Accepted / … (not “Pending Approval”); payment method filter; Export CSV; row checkboxes + bulk bar.
2. Open a pending order — no **Accept Order** approval CTA; **Mark as Accepted** / **Mark as Packed** / **Cancel Order**.
3. Customer `/orders/[id]` — **Request Cancellation** while pending; vendor detail banner Approve/Reject.
4. Reject a line (qty 0) — reason required; Activity Log shows it.
5. **Order history** panel: Timeline / Status History / Activity Log from `OrderEvent`.
6. Download invoice PDF from order detail; bulk Print invoices from list.

## What’s still missing (simple)

1. Order Workspace overhaul — brief **recommendation** only  
2. IGST / inter-state invoice matrix — deferred tax work  

See also: [SECTION7-ORDER-GAP-ANALYSIS.md](./SECTION7-ORDER-GAP-ANALYSIS.md)

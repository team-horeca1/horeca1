# Section 7 — Order Management Test Guide

**Date:** 2026-07-28  
**Playwright:** `e2e/vendor-orders-section7.spec.ts` (9 tests)  
**Accounts:** vendor `fresh@dailyfreshfoods.com` / `vendor123` · customer `chef@tajpalace.com` / `customer123`  
**Last verified:** 8 passed ×2 prior to Workspace/IGST leftover; re-run after leftover ship

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
| Order Workspace queues + IGST supply matrix helper | Workspace hub + IGST |

## Manual UI smoke

1. `/vendor/orders?view=workspace` — queues for cancel / pending / accepted / packed / ready-for-dispatch with next-action buttons.
2. `/vendor/orders` — tabs, payment method filter, Export CSV, row checkboxes + bulk bar; link to Workspace.
3. Open a pending order — no **Accept Order** approval CTA; **Mark as Accepted** / **Mark as Packed** / **Cancel Order**.
4. Customer `/orders/[id]` — **Request Cancellation** while pending; vendor detail banner Approve/Reject.
5. Reject a line (qty 0) — reason required; Activity Log shows it.
6. Invoice PDF: same-state vendor/buyer → CGST+SGST; different states (or GSTIN state codes) → IGST.

## What’s still missing (simple)

1. Dedicated Invoice table — optional (`orderNumber` = invoice #)  
2. S8 fulfilment depth (executives, failed delivery) — next section  

See also: [SECTION7-ORDER-GAP-ANALYSIS.md](./SECTION7-ORDER-GAP-ANALYSIS.md)

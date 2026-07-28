# Section 7 — Order Management  
## Gap analysis (codebase vs brief)

**Date:** 2026-07-28  
**Scope note:** Auto-accept, OrderEvent, R12, Flow 18, bulk 32–34, polish, IGST, and **Order Workspace as the primary Online Store ops screen** (split-pane queues + in-place workbench). Full list is secondary (`?view=list`).  
**Optional:** Dedicated Invoice table — `orderNumber` doubles as invoice #.

**Out of scope for Section 7:** Delivery ops (S8), Returns (S9), Payment collection, Customer ledger, in-app chat.

---

## Status mapping (brief ↔ code)

| Brief filter | Code / rule | Meaning |
|---|---|---|
| **New** | `pending` + just-placed (or `createdAt` within 2h) | Transient “just landed” |
| **Pending** | `pending` | Auto-accepted — **Rule 12 cancel window** |
| **Accepted** | `confirmed` | Left cancel window |
| **Partially Accepted** | `isPartial === true` | Line short-ship via events |
| **Packed** | `processing` | |
| **Ready for Dispatch** | `ready_for_dispatch` | |
| **Dispatched** | `shipped` | |
| **Delivered / Completed** | `delivered` | |
| **Cancelled** | `cancelled` | |

Platform rule: place → `pending` + `acceptedAt` + reserved stock. No approval gate.

---

## Order Workspace (primary)

| Surface | Path | Role |
|---------|------|------|
| **Workspace** | `/vendor/orders` (default) | Stage queues + selected-order workbench (lines, stock, partial, status, invoice, cancel review, notes/contact, activity) |
| **All orders** | `/vendor/orders?view=list` | Filters, checkboxes, bulk print/status, CSV export |
| **Full detail** | `/vendor/orders/[id]` | Picklist, e-way, delivery proof, claims (S8 depth) |

Components: [`OrderWorkspace.tsx`](../src/components/features/vendor/OrderWorkspace.tsx), [`OrderWorkbenchPanel.tsx`](../src/components/features/vendor/orders/OrderWorkbenchPanel.tsx).

---

## Objectives / rules / flows

All Section 7 objectives O1–O8, developer rules (incl. R12), and flows 1–34 remain **Pass** as previously documented. Workspace is now the primary UI for O2–O5 day-to-day processing.

Communication MVP: customer notes + tel/mailto; cancel vendor note; notifications via existing events — no chat.

---

## What’s still missing

1. Dedicated Invoice entity (optional)  
2. S8 fulfilment depth (executives, failed delivery, labels)  
3. In-app customer messaging / AI exception engine (future)

---

## Key files

- `src/components/features/vendor/OrderWorkspace.tsx`
- `src/components/features/vendor/orders/OrderWorkbenchPanel.tsx`
- `src/components/features/vendor/orders/CancelRequestBanner.tsx`
- `src/app/vendor/(dashboard)/orders/page.tsx` — default Workspace / `?view=list`
- `src/lib/gstPlaceOfSupply.ts` + `src/lib/invoice.ts`
- `e2e/vendor-orders-section7.spec.ts`
- `docs/SECTION7-ORDER-TEST-GUIDE.md`

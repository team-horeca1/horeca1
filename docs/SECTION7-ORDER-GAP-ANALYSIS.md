# Section 7 — Order Management  
## Gap analysis (codebase vs brief)

**Date:** 2026-07-28  
**Scope note:** Auto-accept, OrderEvent, R12, Flow 18, bulk 32–34, polish, IGST. **All orders list is the default** at `/vendor/orders`. Optional 3-zone Order Workspace via `?view=workspace`.  
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

## Order surfaces

| Surface | Path |
|---------|------|
| **All orders** (default) | `/vendor/orders` — filters, multi-select bulk / CSV (flows 32–34) |
| **Workspace** (optional) | `/vendor/orders?view=workspace` — 3-zone queue / workbench / Activity |
| **Full detail** | `/vendor/orders/[id]` — picklist, e-way, delivery proof |

### Order Workspace (optional — 3-zone)

| Zone | Role |
|------|------|
| **Left** | Stage chips + search / date / payment filters; queue rows with rule-based `attentionReasons` badges; 20s light poll + Refresh |
| **Center** | Workbench: status advance, invoice, attention strip, line partial/reject/qty, R12 cancel while pending, notes/tel/mailto |
| **Right** | Activity rail — Timeline / Status / Log from `OrderEvent` + invoice meta (Rule 14 accepted qty). Permanent on `lg+` |

Components: `OrderWorkspace.tsx`, `OrderWorkbenchPanel.tsx`, `ActivityRail.tsx`, `src/lib/orderAttention.ts`.

### Workspace behaviour notes

1. List is primary; Workspace is opt-in via `?view=workspace`  
2. Customer communication = status/event notifications only (no chat)  
3. Queue freshness = 15–30s poll (implemented 20s) + Refresh  
4. Desktop-first 3 columns at `lg+`; stack on smaller viewports  

### Explicitly deferred (Workspace redesign)

- Delivery ops, returns, payment collection, ledger  
- Expanding bulk 32–34 / cancel-request UI inside Workspace (remain on list/detail)  
- Two-way messaging, websockets, tablet-first warehouse layout, AI/ML attention  

---

## Objectives / rules / flows

All Section 7 objectives O1–O8, developer rules (incl. R12), and flows 1–34 remain **Pass** as previously documented. Day-to-day processing uses the All orders list (and optional Workspace).

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
- `src/components/features/vendor/orders/ActivityRail.tsx`
- `src/components/features/vendor/orders/CancelRequestBanner.tsx`
- `src/lib/orderAttention.ts`
- `src/app/vendor/(dashboard)/orders/page.tsx` — default All orders / `?view=workspace`
- `src/lib/gstPlaceOfSupply.ts` + `src/lib/invoice.ts`
- `e2e/vendor-orders-section7.spec.ts`
- `docs/SECTION7-ORDER-TEST-GUIDE.md`

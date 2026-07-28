# Section 7 — Order Management  
## Gap analysis (codebase vs brief)

**Date:** 2026-07-28  
**Scope note:** Auto-accept, **OrderEvent** + Timeline/Status History/Activity Log, **Rule 12**, status filters, **Flow 18** CancelRequest, **flows 32–34** bulk print/status/CSV export, polish (payment method filter, required per-item reject reason, invoice# search copy, apply substitute), **Order Workspace** hub, and **IGST** place-of-supply on invoices.  
**Optional (not required):** Dedicated Invoice table — `orderNumber` doubles as invoice #.

**Out of scope for Section 7:** Delivery ops (S8), Returns (S9), Payment collection, Customer ledger.

---

## Status mapping (brief ↔ code)

| Brief filter | Code / rule | Meaning |
|---|---|---|
| **New** | `pending` + just-placed (no fulfilment OrderEvents beyond create/auto-accept, or `createdAt` within 2h) | Transient “just landed” |
| **Pending** | `pending` | Auto-accepted, not yet Packed — **Rule 12 cancel window** |
| **Accepted** | `confirmed` | Left cancel window / entered fulfilment queue |
| **Partially Accepted** | `isPartial === true` | Line short-ship via events |
| **Packed** | `processing` | |
| **Ready for Dispatch** | `ready_for_dispatch` | |
| **Dispatched** | `shipped` | |
| **Delivered** | `delivered` | |
| **Cancelled** | `cancelled` | |
| **Completed** | `delivered` (filter alias) | No separate enum |

Platform rule: place → `pending` + `acceptedAt` + `fulfilledQty = quantity` → inventory reserved → invoice ready. No vendor approval gate.

---

## Objectives

| # | Brief | Verdict | Evidence / gap |
|---|--------|---------|----------------|
| O1 | Online Stores receive Customer Orders | **Pass** | Create + notifications; vendor `/vendor/orders` |
| O2 | Review and process Orders | **Pass** | Order detail + ActionPanel |
| O3 | Accept, Reject or Partially Accept | **Pass** | Auto-accept on place; partial/reject via events; cancel while pending |
| O4 | Manage Order Fulfilment | **Pass** | Status advances + warehouse (S8 depth separate) |
| O5 | Update Order Status | **Pass** | `VALID_TRANSITIONS` + OrderEvents |
| O6 | Generate Invoices | **Pass** | PDF from accepted/`fulfilledQty`; bulk merge via `pdf-lib`; CGST/SGST or IGST by place of supply |
| O7 | Complete or cancel Orders | **Pass** | Delivered; cancel only pending (R12); CancelRequest review |
| O8 | Complete Activity Timeline | **Pass** | `OrderEvent` + detail UI |

---

## Core philosophy

| Statement | Verdict | Notes |
|-----------|---------|-------|
| Every Order belongs to one Customer and one Outlet | **Pass** | `userId` + `outletId` |
| Defined lifecycle | **Pass** | Status enum + transitions |
| Permanent business record once placed | **Pass** | Auto-accept; no approval draft after place |
| Original Order never edited; changes as Order Events | **Pass** | Ordered qty/prices immutable; `fulfilledQty` + `OrderEvent` |

---

## Developer rules

| Rule | Brief | Verdict | Evidence / gap |
|------|--------|---------|----------------|
| Platform | Auto-Accepted by default | **Pass** | Create/submit → `pending` + `acceptedAt` |
| R1 | One Outlet, multi products, one Customer | **Pass** | |
| R2 | Original Order not modified | **Pass** | Snapshot lines; no price rewrite |
| R3 | Changes as Order Events | **Pass** | `OrderEvent` model |
| R4 | Inventory reserved after confirmation | **Pass*** | Reserved at place (auto-accept = confirmed for inventory) |
| R5 | Complete Status History | **Pass** | Events filtered by status actions |
| R9 | Complete Activity Timeline | **Pass** | Full event feed |
| R11 | Pricing locked at placement | **Pass** | Snapshots |
| R12 | Only Pending cancelled by store | **Pass** | Cancel edge only from `pending` |
| R13 | Unique Order Number | **Pass** | `orderNumber` `@unique` |
| R14 | Invoice from Accepted quantities | **Pass** | `invoice-items.ts` + `fulfilledQty` |
| R15 | User / DateTime / Action on every action | **Pass** | `OrderEvent.actorId` + `createdAt` + `action` |

\*Brief R4 says “after Confirmation”; with auto-accept, place is confirmation.

---

## UI/UX flows

| # | Flow | Verdict | Notes |
|---|------|---------|-------|
| 1 | Open Order Management | **Pass** | `/vendor/orders` + `?view=workspace` hub |
| 2 | View Orders | **Pass** | |
| 3 | Filter (brief statuses) | **Pass** | New/Pending/Accepted/… tabs |
| 4 | Receive New Order notification | **Pass** | `OrderCreated` |
| 5 | View Order Details | **Pass** | `/vendor/orders/[id]` |
| 6 | Review products/qty/price/payment | **Pass** | |
| 8 | Reject complete + reason | **Pass** | Cancel while pending |
| 9 | Partial acceptance | **Pass** | Qty adjust + events; stay pending until status advance |
| 10 | Reject individual item + reason | **Pass** | Qty → 0 requires reason in UI before PATCH |
| 11 | Modify accepted quantity | **Pass** | Amend + events |
| 12–16 | Processing → Packed → Ready → Dispatch → Complete | **Pass** | Labels mapped |
| 17 | Cancel Pending + reason | **Pass** | R12 |
| 18 | Customer cancellation request | **Pass** | `CancelRequest` + customer/vendor APIs + UI; events `cancel.*` |
| 19–21 | Invoice generate / view / download PDF | **Pass** | Download PDF; no separate Invoice entity |
| 25–27 | Timeline / Status History / Activity Log | **Pass** | From `OrderEvent` |
| 28 | Search order / customer / invoice # | **Pass** | `orderNumber` as invoice #; placeholder “Order / Invoice / Customer” |
| 29 | Filter by date | **Pass** | |
| 30 | Filter by payment type Cash/Online/Credit | **Pass** | `paymentMethod` query + list UI |
| 32–34 | Bulk print / bulk status / export | **Pass** | `POST .../bulk`, `GET .../export`, list checkboxes |

---

## Expected system outcome

| Outcome | Verdict |
|---------|---------|
| Real-time receive | **Pass** |
| Predefined lifecycle | **Pass** |
| Original immutable + events | **Pass** |
| Accept / Reject / Partial | **Pass** (auto-accept + post-hoc) |
| Inventory / Pricing / Credit applied | **Pass** |
| Invoices from accepted qty | **Pass** |
| Timeline + Activity Log | **Pass** |
| Status through fulfilment | **Pass** |

---

## What’s missing (simple)

1. **Dedicated Invoice table** — optional; `orderNumber` doubles as invoice # today.  
2. **S8 Fulfilment Workspace depth** (executives, failed delivery, labels) — Section 8, not S7.

## What’s missing (detail)

| ID | Item | Priority | Notes |
|----|------|----------|-------|
| S7-N4 | Dedicated Invoice entity (optional) | S | Search uses `orderNumber` as invoice # |

Shipped: Flow 18 CancelRequest; bulk print/status/export; payment method filter; required per-item reject reason; apply substitute; Order Workspace hub; IGST place-of-supply matrix; human Playwright UI journeys.

---

## Key files

- `prisma/schema.prisma` — `Order`, `OrderItem`, `OrderEvent`, `CancelRequest`
- `src/modules/order/order.service.ts` — create, transitions, partial, substitute, events
- `src/modules/order/cancel-request.service.ts` — customer request + vendor review
- `src/modules/order/order-events.ts` — emit helpers + action constants
- `src/lib/invoice.ts` / `src/lib/gstPlaceOfSupply.ts` — tax invoice + IGST/CGST/SGST
- `src/app/vendor/(dashboard)/orders/` — list (bulk/export) + detail + `?view=workspace`
- `src/components/features/vendor/OrderWorkspace.tsx` — next-action hub
- `src/app/api/v1/vendor/orders/` — list/detail/PATCH/invoice/bulk/export
- `src/app/api/v1/orders/[id]/cancel-request/` — customer cancel request
- `src/app/api/v1/vendor/cancel-requests/` — vendor list + PATCH
- `e2e/vendor-orders-section7.spec.ts`
- `docs/SECTION7-ORDER-TEST-GUIDE.md`

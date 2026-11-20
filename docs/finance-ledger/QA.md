# Supplier Payables — QA

Checked on 20 November 2026 from branch `demo`. The local database was `127.0.0.1:5432/horeca1`. Production was not used. Complete demo/production isolation was preserved.

## Test Commands & Results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **Passed**. Zero TypeScript errors. |
| `npx vitest run src/modules/finance/__tests__` | **Passed**. 42 tests passed (39 calculation and transition tests, 2 claim-exclusion tests, 1 local Postgres concurrency test). |
| `npx playwright test e2e/supplier-payables.spec.ts` | **Passed**. 3 tests passed across 3 workers covering desktop, tablet, and mobile viewports. |
| `npx playwright test e2e/capture-finance-screenshots.spec.ts` | **Passed**. Captured high-resolution documentation screenshots for all 4 redesigned views. |

## Playwright End-to-End Verification

1. **Admin Payables (`/admin/finance`)**:
   - Navigation and authentication with `admin@horeca1.com`.
   - 4 KPI cards render accurately: To Pay Now (Hero burgundy gradient), Customer Paid, Razorpay Fee, Commission.
   - Non-payable cash explanation banner displayed with contextual counts.
   - Search filter tests: typing filter shows matching supplier; invalid search correctly renders the empty state.
   - Status filters (*Ready to pay*, *Missing rate*, *Missing fee*, *Not delivered*, *Paused*, *Paid*) filter the table without page reload.
   - Responsive layout verified across viewports:
     - Desktop: 1440x960 (`docs/finance-ledger/screenshots/payables-1440.png`)
     - Tablet: 768x960 (`docs/finance-ledger/screenshots/payables-768.png`)
     - Mobile: 390x960 (`docs/finance-ledger/screenshots/payables-390.png`)

2. **Pay Supplier Modal**:
   - Modal dialog opens when clicking the Burgundy Pay button.
   - Displays exact supplier name, code, and transfer amount.
   - Bank reference field requires minimum 6 characters.
   - Note field requires minimum 3 characters.
   - Information banner confirms that Horeca1 records the reference without initiating an automated bank transfer.
   - Confirmed settlement marks the row with a green `Paid` status badge.
   - Screenshot: `docs/finance-ledger/screenshots/payables-modal-1440.png`.

3. **Supplier Details (`/admin/finance/payables/{supplier}`)**:
   - Breadcrumb navigation and back button.
   - Profile card displays supplier logo mark, business name, status badge, vendor code, commission rate badge, and settlement cycle selector.
   - 4 KPI cards matching the dashboard hierarchy.
   - 4 Tabs: Orders, Commission History, Recoveries, Settlements.
   - Order table expandable calculation drawer displays line-by-line breakdown (commercial base, platform vs vendor promo, tax-inclusive base, commission, net payable).
   - Hold/release requires an audit reason of at least 8 characters.
   - Payment Advice PDF download link verified (`application/pdf`).
   - Screenshots: `payables-detail-1440.png` and `payables-detail-390.png`.

4. **Supplier Portal: What I Receive (`/vendor/receive`)**:
   - Authenticated with supplier account (`fee-example-supply@example.com`).
   - Displays 4 KPI cards with "Still to Receive / Received" hero card.
   - Statement table with Order, Customer Paid, Razorpay Fee, Commission, Net Receivable, and Payment Advice download link.
   - Mobile view displays stacked cards with key-value alignment.
   - Explanatory footer clarifies payment advice is not a goods tax invoice.
   - Screenshots: `vendor-receive-1440.png` and `vendor-receive-390.png`.

5. **Security & RBAC**:
   - Anonymous access to `/api/v1/admin/finance/payables` rejected (401/403).
   - Non-permitted roles cannot access finance actions.

## Financial Cases Verified by Tests

- Positive commission calculation (subtotal minus vendor discount × rate%).
- Explicit 0% commission vs unconfigured rate.
- Missing commission agreement blocks payable from payout.
- Captured payment but uncompleted delivery blocks payout.
- Multi-row payments and partial cash collections.
- Multiple refunds reducing cash base without going negative.
- Vendor promotion vs platform coupon treatment.
- Concurrent claim protection (Postgres advisory / row-level lock ensures single batch ownership).
- Unchanged legacy wallet calculations preserved.

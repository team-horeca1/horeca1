# Supplier Payables — Investigation

This note records what was in the repository before Phase 1 was built. It is the source for the decisions in [IMPLEMENTATION.md](./IMPLEMENTATION.md). There is no Financial Event Matrix, supplier-settlement policy, or earlier finance-ledger document in this repository. The knowledge-graph service was unavailable, so the findings below come from the schema and the order, payment, return, and wallet code.

Branch at the start of the work: `demo`, fast-forwarded to `origin/demo`. The local `DATABASE_URL` points at `127.0.0.1` and database `horeca1`. Production was not queried.

## Order grain

A customer checkout is not one order with many suppliers. `src/modules/order/order.service.ts` creates one `Order` per supplier inside a single transaction. Those orders share `checkoutGroupId`. `Order.vendorId` is required. `OrderItem` has no supplier of its own.

`src/modules/payment/payment.service.ts` can open one Razorpay order for several of those purchase orders. It writes one `Payment` row per order, each with that order's `totalAmount`, all sharing `razorpayOrderId`. Capture checks that the sum of the rows matches the gateway amount.

A split creates a new order for the same supplier. The child does not receive the parent's payment rows.

**Decision:** one supplier payable per `Order.id`. Tests use two suppliers in one checkout group.

## What the money fields mean

Checkout writes:

- `subtotal` — sum of line totals before promo, coupon, and rewards-wallet redemption. Each line unit price is the taxable price times `(1 + taxPercent / 100)`, so GST is already inside `subtotal`. `order.taxAmount` is not set at checkout and defaults to 0.
- `promoDiscount` — this supplier's own promotion. A coupon that does not stack with it stores this as 0.
- `couponDiscount` — this purchase order's share of the coupon, not the whole checkout discount. `Coupon.vendorId` null means a platform coupon. A coupon with this order's `vendorId` is supplier-funded.
- `walletApplied` — rewards-wallet redemption. `totalAmount = subtotal − promoDiscount − couponDiscount − walletApplied`.

Quantity edits rewrite `subtotal`. A money refund does not rewrite `subtotal`. A credit note credits the customer rewards wallet and does not debit the supplier wallet. A replacement purchase order is created with `paymentMethod = replacement` and `paymentStatus = paid`, and it has no captured payment row. Cancelling an order does not refund Razorpay by itself.

`Payment.status` is `created | authorized | captured | failed | refunded`. `Order.paymentStatus` is `unpaid | paid | partial | refunded`. `partial` has no writer in the order or payment services. DiSCCO, vendor credit, `wallet`, and `h1_wallet` can set `paymentStatus` to `paid` without a captured cash payment. COD is treated as a successful order by the promotion code once fulfilment has started, but checkout does not write a captured COD payment. Offline bank transfer, PO, and cheque become a captured `Payment` only when an admin marks the order paid.

The existing partial-refund path in `payment.service.ts` rejects a Razorpay refund that is not the full payment and does not change the order.

## Existing supplier settlement

`Vendor.platformFeePct` null means "use `PlatformSetting.defaultCommissionPct`" (schema default 5). The supplier admin control saves null for that global default. An explicit 0 and "not configured" are the same value today.

`src/modules/vendor/vendorSettlement.service.ts`:

- On delivery, credits `VendorWallet` with `totalAmount − platform fee − 2% gateway fee` for `online`, `prepaid`, and `razorpay`, when a gateway order is `paid`. Credit methods are skipped. The 2% figure is the constant `GATEWAY_FEE_PCT`. It is not in a client matrix.
- Writes the result once onto the order snapshot fields.
- `createSettlementBatch` debits that same wallet net immediately and links the order in `VendorSettlementOrder`. Weekly cron and vendor instant payout both call it. Instant payout stores a synthetic `INSTANT-*` reference.
- A refund debit is one wallet row per order.

There is no hold, no locked batch, no second approver, and no append-only supplier journal. Admin finance already has `/admin/finance` and `/admin/ledger`, gated by `payments.view` and `payments.create`. There is no separate finance-approver permission.

Salesperson `CommissionRule` rows are a different feature and are not the supplier platform fee.

## Decisions forced by those facts

1. Payables are per purchase order, not per checkout and not per line item.
2. Collected cash is the sum of that order's cash `Payment` rows, not `paymentStatus`.
3. Rewards wallet, DiSCCO, credit, and replacement are not cash even if a row is marked captured.
4. Only a processed refund reduces collected cash, and it is applied once.
5. Commission uses the tax-inclusive `subtotal`. That is a Phase 1 assumption, not a tax opinion. GST is not extracted.
6. A missing supplier rate is not 0% and is not the global default.
7. Finance batches are new rows. They do not reuse `VendorSettlement`, because those rows already mean "wallet debited".
8. An order can be claimed by finance or by the legacy wallet batch, not both. The claim is inserted in the same database transaction as the batch, under a row lock, with one active claim per order.
9. Clearing the wallet on finance settlement removes the remaining exposure of the original delivery credit after refund debits already posted for that order. It does not debit the new payable and it is not a bank transfer.
10. A refund after settlement appends a recovery. It does not rewrite the batch.
11. Service fees, replacement repricing, TCS, TDS, and DiSCCO repayment are not implemented. No client rule for them was found.

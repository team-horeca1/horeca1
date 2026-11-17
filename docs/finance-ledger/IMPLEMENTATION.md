# Supplier Payables — Phase 1 implementation

This is the behaviour that the code implements. The investigation behind it is [INVESTIGATION.md](./INVESTIGATION.md). The client-facing description is [README.md](./README.md).

## Grain

One `SupplierPayableLine` per `Order`. The supplier is `Order.vendorId`. A checkout with two suppliers produces two lines. A split child order is its own line and can use only payment rows stored on that child.

## Calculation

All arithmetic is integer paise. Values are stored as `Decimal(12,2)` rupees, converted at the boundary with exact two-decimal strings.

**Commercial base** = current `subtotal − supplier promo − supplier coupon share`.

- Supplier promo is `promoDiscount`, once. If a coupon suppressed it, the stored value is already 0.
- Supplier coupon share is `couponDiscount` only when `Coupon.vendorId` equals this order's supplier. A platform coupon is not deducted.
- Rewards-wallet redemption is not a supplier discount.
- Quantity edits are already in `subtotal` and are not subtracted again.
- GST is inside `subtotal`. **Phase 1 calculates commission on that tax-inclusive amount.** This is a calculation assumption that needs client confirmation. It is not a CA determination. The code does not extract GST, and it does not add `taxAmount`.

**Cash collected** is the sum of this order's `Payment.amount` where status is `captured` or `refunded` (a refunded row was collected, then refunded) and the method is cash: `online`, `prepaid`, `razorpay`, `bank_transfer`, `po_number`, `cheque`, `cod`, or `cash`.

These methods are ignored even when status is `captured`: `wallet`, `h1_wallet`, `credit`, `vendor_credit`, `discco`, `replacement`. `order.paymentStatus = paid` is not cash. COD with no cash payment row stays pending capture.

**Processed refunds** reduce that sum once: a return that is `closed` with resolution `refund` and a positive `refundAmount`. A cash payment already marked `refunded` counts as a processed refund only for the amount not already covered by those returns. Pending, rejected, and credit-note resolutions do not reduce cash. The net cannot fall below zero. Several cash rows and several processed refunds are summed.

**Recognised base** = `min(commercial base, net collected)` and only when the order status is `delivered`. Otherwise it is 0. A captured order that is not delivered can show a provisional figure. That figure is not commission and is not payable.

**Commission** = recognised base × the supplier rate. The rate comes from `SupplierCommissionAgreement`. `Vendor.platformFeePct` is only the current pointer.

- Null means **Commission not configured**. It is not 0% and it is not `PlatformSetting.defaultCommissionPct`.
- An explicit 0% is a real agreement and produces a payable with no commission.
- The rate is snapshotted on the line the first time the order is delivered with a configured rate. A later change does not rewrite that snapshot.

**Net payable** = recognised base − commission + approved manual credits − approved manual debits, and never above net collected cash. Unconfigured commission produces no net payable. The blocked sale value is shown separately.

Replacement orders and cancellations before delivery are not supplier liabilities. A credit note is shown and excluded. No rule was found for who bears it. The amount of commercial base above cash collected is disclosed and not booked.

## Outstanding and the other totals

**Total Supplier Outstanding** is the sum of net payable on lines that are eligible, on hold, or in a draft, in-review, or finalised batch, minus unapplied recovery. Creating or finalising a draft does not change it. It falls when a batch is marked settled, and it changes when an open recovery is recorded.

**Eligible for settlement** is only the eligible bucket: delivered, cash-capped, rate configured, net above zero, not on hold, and not already in a batch.

Pending capture, awaiting completion, unconfigured commission, above-cash gaps, credit notes, replacement orders, and settled history are outside both of those totals. Each open liability is in exactly one of eligible, held, batched, or settled.

## Commission changes

An authorised user (`payments.create` on the payables commission route, or `vendors.edit` when the supplier profile sends a rate) must give a reason. The previous open agreement is closed. A new agreement is inserted for a numeric rate, including 0. Clearing the rate closes the agreement and sets `platformFeePct` to null. The audit log stores the previous value, the new value, the actor, and the reason.

## Settlement

Finance batches live in `FinanceSettlementBatch`. They are not `VendorSettlement` rows.

1. **Draft.** Eligible lines only. Claims those orders. No UTR and no wallet movement. Lines leave "eligible" and stay inside outstanding.
2. **Cancel draft.** Requires `payments.create`, a reason, an actor, and a timestamp. Releases the claims and any recovery the draft had applied. Finalised and settled batches cannot be cancelled.
3. **Finalise.** A different user from the creator. There is no second finance permission, so this is the maker-checker, and a single admin cannot approve their own batch. The batch locks. It is still outstanding. No wallet movement.
4. **Mark settled.** Only from `finalised`. Requires a non-empty operator UTR of at least 6 characters. Values that start with `INSTANT-` are rejected. Stores the operator and timestamp. A repeat with the same UTR returns the existing batch and does not write again. A different UTR on an already settled batch is rejected.
5. **Recovery.** A new event. Settled amounts are not edited.

The screen states that the UTR is the operator's record. It does not say the bank was verified. This phase has no bank integration.

Scheduled generation creates **drafts** only, and only for suppliers whose `settlementCycle` is `weekly`. The default cycle is `manual`. The existing weekly wallet cron still runs. Finance drafts are created first so a weekly supplier's eligible orders are claimed before the wallet cron looks at them.

## Legacy wallet

`computeOrderSettlementAmounts` is unchanged, including the 2% gateway fee and the global default inside `resolvePlatformFeePct`. Delivery still credits the vendor wallet through that function.

`createSettlementBatch` (weekly cron and instant payout) takes `FOR UPDATE` on each order and inserts a `legacy_wallet` claim in that same transaction. Finance draft creation does the same with a `finance` claim. A partial unique index allows one active claim per order. The transaction that loses the claim skips the order. The claim and the batch commit or roll back together. A failed transaction does not leave a claim. A sweep releases a finance claim whose batch is missing or already cancelled.

On **mark settled** only, if the order is not already in `VendorSettlementOrder`, the service posts one `VendorWalletTxn` of type `settlement_debit` with `referenceType = finance_settlement_release`. The amount is the original delivery credit's net, minus refund debits already posted for that same order, minus any release already posted. That stops a refund that already left the wallet from being removed twice. The note on the row says it clears the provisional wallet credit and is not a bank transfer. A second settle call finds the existing row and writes nothing. Draft and finalise do not touch the wallet.

An order that is already in `VendorSettlementOrder` cannot enter a finance batch, and finance settlement writes no wallet row for it.

## Refunds

Before settlement, a processed refund lowers net collected and the open line is recalculated. The same return is not also subtracted from `subtotal`.

After settlement, the batch totals and the snapshotted line amounts stay as they were. A recovery event stores the reduction in net payable that the refund would have caused. Unapplied recovery reduces outstanding and can be applied to a later draft as an adjustment. Cancelling that draft releases the recovery back to unapplied.

## Permissions and audit

Read APIs require `payments.view`. Draft, cancel, finalise, settle, hold, release, commission changes, and manual adjustments require `payments.create`. Each of those writes an audit log entry and, for batches, a `FinanceSettlementEvent`.

Manual adjustments stay pending until a different user approves them.

## What this phase does not decide

No customer platform service fee. No GST extraction, TCS, or TDS. No repricing rule for replacement orders. DiSCCO balances and repayment are unchanged. Expired supplier promotional credit has no balance to reverse. Partial Razorpay refunds are still rejected by the existing payment service. The payable cap still refuses to reduce collected cash below zero.

# Supplier Payables — Phase 1

Horeca1 Finance now shows what the platform owes each supplier after that supplier's commission, and it can prepare and record a settlement without sending a bank payment.

## The problem

Supplier orders, captured payments, commission, and the existing vendor wallet were not one picture. Finance could not see, for each supplier, what is owed, what is only waiting on delivery or on cash collection, and what has already been settled.

## What this phase includes

- A supplier payable for every purchase order. A checkout with two suppliers creates two payables.
- A supplier-specific commission rate. Blank means **Commission not configured**. Zero means a real 0% rate. The old platform-wide default is not applied.
- A supplier list, a supplier statement, and a line-by-line calculation.
- Draft, cancel, finalise, and mark-settled batches. Marking settled stores the operator's UTR. It does not contact a bank.
- Holds, manual adjustments that need a second person, and an append-only recovery when money changes after a batch is locked.
- A weekly job that only prepares drafts for suppliers set to a weekly cycle.

The screen is **Finance → Supplier Payables** at `/admin/finance/payables`.

## What this phase does not include

DiSCCO lending, customer or supplier credit ledgers, wallet redesign, tax returns, bank payment APIs, bank-statement reconciliation, and a formal period close. Replacement-order repricing is not decided. A customer platform service fee is not added.

## How a supplier payable is worked out

The supplier pays Horeca1's commission. It is deducted from the supplier's amount. The customer is not the commission payer.

The commercial base is the order subtotal minus that supplier's own promotion and that supplier's own coupon. A platform coupon is not deducted from the supplier. Rewards-wallet redemption is not a supplier discount. GST is already inside the subtotal, so **commission in this phase is calculated on a tax-inclusive amount**. That is a Phase 1 assumption and needs client confirmation. It is not a tax or CA ruling. GST is not removed from the price.

Cash counts only when a payment row is real cash: online, prepaid, Razorpay, bank transfer, purchase order, cheque, COD, or cash. Rewards wallet, DiSCCO, and credit do not count, even if a row says captured. Only a processed refund reduces the cash, and it cannot reduce it below zero.

The payable is recognised when the order is **delivered** and the cash has been **collected**. Those are different events.

`Net payable = recognised base − commission`, and it cannot be higher than the cash collected after refunds. If the commission rate is missing, the line is blocked and is not silently treated as 0%.

## Settlement

1. A draft selects eligible lines. The supplier's outstanding balance does not disappear.
2. Cancelling a draft is audited and releases the lines.
3. Finalising needs a different person from the creator and locks the batch. It is still outstanding.
4. Marking settled needs the operator's UTR, name, and time. Repeating it does not pay the batch again.
5. A later refund does not rewrite that batch. It adds a recovery that can reduce a future settlement.

Scheduled settlement only creates drafts. It does not move money.

The older vendor wallet still uses its existing formula, including the 2% gateway deduction in that code. A finance settlement and that wallet batch cannot take the same order. When finance records a UTR, the wallet entry that clears the provisional credit is not a second bank transfer.

## Who can do what

Viewing requires the existing payments view permission. Creating a draft, cancelling it, finalising, recording a UTR, changing a commission rate, and holding a line require payments create. Commission changes store the old rate, the new rate, the reason, the person, and the time.

## Edge cases the calculation covers

Configured and zero commission, missing commission, captured but not delivered, authorised or failed payments, full and partial cash collection, several payments, several refunds, a refund larger than the cash, supplier and platform discounts together, a quantity change together with a refund, two suppliers in one checkout, holds, locked batches, and a repeated settle request.

## Known limits

- No Financial Event Matrix was in the repository. Where a treatment was not specified, it is excluded rather than invented.
- Commission on the tax-inclusive subtotal needs client confirmation.
- Credit notes are shown and not charged to the supplier. No rule said who bears them.
- Replacement orders are excluded. Repricing them is unresolved.
- Partial Razorpay refunds are still rejected by the existing payment service.
- The UTR is not checked with a bank.
- One admin cannot finalise a batch they created. There is no separate approver role.

## How to look at it on demo

Open `https://demo.horeca1.com/admin/finance/payables` as a finance admin after the demo branch has been deployed. Outstanding is the balance now. The date filter changes commission and settled totals only.

Use synthetic suppliers on the demo database. Do not use production data.

## Phase 2

Confirm the tax-inclusive commission base. Decide replacement repricing, credit-note bearing, and any customer service fee. A bank payment file and a maker-checker role can sit on these batches without replacing them. The vendor wallet and these payables can then be brought onto one ledger.

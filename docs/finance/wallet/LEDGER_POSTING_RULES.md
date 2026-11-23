# Ledger posting rules

Amounts below are integer paise. ₹1 = 100 paise. Each entry balances. A missing `platformFeePct` posts no commission and does not release Held for Supplier.

## Reward issued

Dr Platform Reward Expense / Cr Customer Wallet (`WALLET:{customer}:reward`).

## Wallet spent on an order

Dr Customer Wallet / Cr Order Receivable. Memo `reward_redeemed`. No expense line.

## Online payment captured

Dr Gateway Clearing / Cr Order Receivable.

## Known Razorpay fee

Dr Supplier Payable / Cr Gateway Clearing. The supplier bears `payments.razorpay_fee_paise`. A missing fee posts nothing.

## Funded delivery (online cash and wallet)

Commission = half-up(`subtotal × rate / 100`).

Dr Order Receivable `subtotal` / Cr Supplier Payable `subtotal − commission` / Cr Commission Revenue `commission`.

Worked example, ₹1,000 order, ₹100 reward and ₹900 online, 2% commission:

- Issue: Dr 10000 expense / Cr 10000 wallet
- Spend: Dr 10000 wallet / Cr 10000 order receivable
- Pay: Dr 90000 gateway / Cr 90000 order receivable
- Deliver: Dr 100000 order receivable / Cr 98000 supplier payable / Cr 2000 commission

Payout is ₹980. Reward expense is ₹100, once. Commission is ₹20.

## Credit delivery (supplier credit or Horeca1 credit)

Dr Credit Receivable `subtotal` / Cr Held for Supplier `subtotal − commission` / Cr Commission `commission`. Supplier Payable stays 0.

Worked example, ₹10,000 credit order, 2% commission, nothing repaid: Held ₹9,800, Payable ₹0, receivable ₹10,000.

## Credit repayment

Dr Gateway Clearing `collected` / Cr Credit Receivable `collected`.

Then, oldest delivered credit order for that supplier first:

release = collected × (subtotal − commission) / subtotal, never more than the held amount left on that order.

Dr Held `release` / Cr Supplier Payable `release`.

₹6,000 repaid on the ₹10,000 example moves ₹5,880 from Held to Payable. ₹3,920 stays held.

## Credit note

Dr Held for the return's supplier / Cr Customer Wallet `cn:{supplier}`. Spending that balance later is a normal wallet spend. The next supplier's delivery still credits their payable in full. No second expense.

## Interest and penalty

Dr Credit Receivable / Cr Interest Income or Penalty Income.

## Write-off while loss bearer is pending

Dr Write-off Pending Allocation / Cr Credit Receivable. Held is not released. No credit-loss expense.

## Reversal

The opposite of the original lines, linked by `reverses_entry_id`. Not larger than the original. Not posted twice. Wallet value returns to the original bucket because the opposite line credits that same wallet account.

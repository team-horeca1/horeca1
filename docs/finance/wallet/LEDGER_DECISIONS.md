# Ledger decisions

These choices are in the code. They are not open questions.

- `LEDGER_SHADOW` and `LEDGER_LIVE` default off. Shadow posting runs only when `LEDGER_SHADOW=1`. Live behaviour changes only when `LEDGER_LIVE=1`. Neither flag is switched on by this change.
- A failed shadow post uses a savepoint so the order, payment, or credit write still commits.
- Customer repayments for supplier credit and Horeca1 credit are cash to Horeca1. The supplier is paid from Held for Supplier only after that cash exists, for `collected × (order − commission) / order`, oldest order for that supplier first.
- Commission is `Vendor.platformFeePct` of `orders.subtotal`. A missing rate posts no commission and does not release Held. The code does not substitute 0% or 5%.
- Wallet spend is Horeca1's money. Delivery of a funded order credits Supplier Payable for the full subtotal minus commission. Reward expense is posted when the reward is issued. Spending it stores the memo `reward_redeemed` and does not post the expense again.
- A credit note is funded by the supplier on the return (Held for that supplier is debited). Spending it is ordinary wallet spend: the next supplier is paid in full and no second expense is posted.
- Until live mode, checkout still spends one wallet balance. The journal records that spend against the reward bucket. Bucket order (credit note, then rewards, oldest first) is implemented in `allocateSpend` and used when a caller passes buckets.
- The real Razorpay fee reduces Supplier Payable when `razorpay_fee_paise` is known. A missing fee does not use 2%.
- Write-offs use `ledger_settings.loss_bearer`, default `pending`, and post to Write-off Pending Allocation. Held for Supplier is not released.
- COD, TCS, TDS, escrow, a customer platform fee, reward expiry, UPI cashback, salesperson commission, `CreditAccount`, and the brand role are not posted.
- The sample supplier sheet totals are not used. They disagree with each other.
- Wallet screens show the existing balance as well as the journal, so a customer is not shown ₹0 while the shadow journal is still empty.
- `discco` is included in the supplier-wallet skip list so that method cannot credit the supplier wallet and a credit line together. The weekly wallet debit and delivery wallet credit stop only when `LEDGER_LIVE=1`.
- An order cancel reverses the journal with event type `order_reversal`. That is a system reversal, so it does not ask for a second person. A manual reversal, write-off, adjustment, or batch approval still requires a different approver.
- A missing commission rate is stored on `ledger_order_flags` as `commission_unconfigured`. COD is stored as `legacy_unsupported`. Neither posts commission.
- Quantity edits do not post a negative wallet spend. When `LEDGER_LIVE=1`, an edit that would leave the wallet larger than the goods is refused.
- When `LEDGER_LIVE=1`, a Razorpay refund of an order puts `walletApplied` back on the customer wallet and credits the same journal bucket. A partial line cancel reverses that fraction of the wallet and credit entries. The supplier payable calculator then pays the funded amount (cash plus wallet) minus commission minus a known Razorpay fee, and leaves credit orders at zero until cash is collected.

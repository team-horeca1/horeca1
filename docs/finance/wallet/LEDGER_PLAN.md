# Horeca1 ledger plan

Source: the client workbook “H1 Financial Module - FEM” (10 tabs, sections A–H) compared with the finance code already on `demo`. This is the build plan. It does not change application code.

The client’s four books are the right product. The workbook already extends them with orders, payments, returns, promotions, commission, and manual corrections. The live app already does a large part of the supplier-payout book. The plan is to finish those four books on top of what is running, not to paste in a second accounting system.

## 1. The four books

| Book the client named | Plain meaning | Who looks at it | What the app has today |
| --- | --- | --- | --- |
| Horeca1 ↔ Supplier payout | What Horeca1 owes a supplier after commission, fees, returns, and holds | Admin Pay suppliers, supplier “What I receive” | Built in Phase 1. This is the book to keep |
| Supplier ↔ Customer credit | Goods the supplier let that customer take now and pay later | Supplier credit screen, customer credit line | Built as supplier `CreditWallet`. Payout hold until collection is only partly enforced |
| DiSCCO | Same shape as supplier credit, but Horeca1 or the lender owns the customer’s debt | `/wallet`, `/admin/credit` | Built as platform `CreditWallet` (`vendorId` empty). It does not pay the supplier from this debt |
| Wallet | Customer spendable balance, and any supplier-side credit that is not a loan | `/rewards` for customers. Supplier wallet screen is a different, older earnings balance | Customer side is one mixed balance. It is not yet a real payment method |

Everything else in the workbook is a rule for how an event lands in one or more of these books.

## 2. One rule that keeps the books from lying

An event is written once, when it happens. Later screens only read those lines.

The supplier payout screen must not subtract returns, credit notes, and promotions again if those events already reduced the amount owed. The workbook says this in Settlement Rule 6, and then the formula at the bottom of Section E subtracts them again. Read literally, that formula charges the supplier twice.

**The app should follow Rule 6.** The payout screen shows a balance that was already reduced. It does not run a second subtraction.

The sample supplier tab cannot be used as a test fixture. Its summary says ₹1,00,000 of invoices, the journal posts ₹21,33,456, the commission cell says 5% while the label says 2%, the commission rupees are 2% of a different total, GST is blank, and the credit hold (₹5,42,343) does not match the credit summary (₹30,000). Build from the rules, not from those sample totals.

The Sections tab also points at the wrong letters: Section G in the workbook is platform revenue, and Section H is penalties and adjustments. Credit Rule 5 points penalties at Section G. Use the section sheets, not the index tab.

## 3. What each event should do

### Orders (Section A)

When an order is placed, remember the funding source: online, wallet, supplier credit, DiSCCO, or a mix. Do not edit that history later. Cancel, supplier cancel, platform cancel, and partial cancel each add a reversal for the cancelled part only.

Supplier payout stays pending until the order is completed. Partial delivery settles only the delivered value.

**Today:** orders, cancel, and short supply exist. Funding is one payment method plus an optional H1 Wallet checkbox. There is no single “this order was funded by these sources” record. Online cancel does not refund Razorpay by itself.

### Payments (Section B)

Each method touches only its own book.

| Method | Customer book | Supplier payout |
| --- | --- | --- |
| Online success | Payment received | Not payable until the order is completed, and only for cash actually captured |
| Wallet | Spend wallet | Not cash. Do not treat it as money collected |
| Supplier credit | Increase what the customer owes that supplier | Hold this invoice until the customer pays |
| DiSCCO | Increase what the customer owes the lender | Pay the supplier on completion, because the lender owns the debt, not the supplier |
| Failed payment | Nothing | Nothing |

A refund cannot exceed what was collected on that payment. Split payment is several of the rows above on one order.

**Today:** online, supplier credit, and DiSCCO work. Wallet is not this payment method. The checkout value `wallet` means Horeca1 Credit, which is DiSCCO-style platform credit. The real spendable balance is a checkbox that reduces the bill. Failed payments do not post money. Refunds are not capped in one shared rule, and a supplier-wallet refund can remove the full original net rather than the refund amount.

### Credit (Section C)

Supplier credit and DiSCCO share one lifecycle. The only difference is who owns the receivable.

- No line, no use.
- Available = limit − outstanding. Also keep a reserved amount for orders not yet delivered, which the sheet does not name but the app needs so the same limit cannot be spent twice.
- Repayment and cancel restore available credit.
- Due date passed marks the line overdue. The sheet says that does **not** by itself add interest or a penalty.
- Suspend and reactivate block or restore new use. Old history stays.
- Write-off and later recovery are new lines. They never delete the debt history.

**Today:** lines, reserve-at-order, outstanding-at-delivery, repay, suspend, freeze, expiry, and reactivate exist. The sheet wants the debt recorded at order placement; the app records a reserve at placement and the debt at delivery. Interest and late fees are charged automatically. The sheet says they are not automatic. Write-off and recovery of a written-off amount are not financial events.

### After delivery (Section D)

A return request holds nothing financial until someone approves it. Approval uses the approved value, not the whole invoice. A credit note reduces what the customer owes or adds wallet credit, and reduces what we owe the supplier. A replacement creates money lines only when the new price differs.

Refund destination in the sheet:

- Online payment → customer wallet first. The customer may later ask for the original bank or card.
- Wallet → wallet.
- Supplier credit → restore the supplier line.
- DiSCCO → reduce what the customer owes the lender.

**Today:** returns, credit notes, and Razorpay refunds exist. Online refunds go back to Razorpay, not to the wallet first. Credit notes credit the H1 Wallet and do not reduce the supplier payable. Replacements do not post a price difference. DiSCCO and supplier-credit returns do not always restore the line.

### Supplier payout (Section E)

Per supplier, on that supplier’s cycle (manual, weekly, 10 days, fortnightly, monthly):

1. Only completed invoices enter.
2. Hold an invoice when the customer still owes the supplier (supplier credit not collected).
3. Release that invoice when the customer pays.
4. DiSCCO invoices are not held for customer collection. The lender carries that debt.
5. Wallet, cashback, and platform-funded discounts are not cash collected.
6. Commission is its own event, on net sale value after the adjustments already posted.
7. One person prepares the batch. A different person locks it. After lock, nothing is added or removed.
8. Paying the supplier records the batch, the supplier, the date, and the bank reference. It does not edit older lines.
9. A reversal is a new entry.

**Today:** Phase 1 already has eligible lines, holds, batches, a second person to finalise, UTR, and recoveries after settle. It pays from captured cash, uses the real Razorpay fee, and refuses to treat wallet and credit as cash. Cycles are manual or weekly only. Commission is calculated inside the payable, not stored as its own earlier event. The old supplier wallet and its instant-payout button still run beside this and can claim the same order. That button does not send a bank transfer.

### Promotions (Section F)

Every offer has one funder: the supplier or Horeca1. Not both in this version. Brand-funded offers are out of scope.

- Supplier-funded: reduce what we owe that supplier when the offer is used. Do not also reduce it again at payout.
- Horeca1-funded: our cost. The supplier payout does not fall.
- Promotional credit is not cash. Issue, spend, and expiry move the promo balance only.
- If a supplier-funded promo credit expires unused, the value goes back to that supplier’s settlement, not to Horeca1.
- Cancel and return reverse the promo entry.

**Today:** supplier coupons and promos already reduce the payable base. Cashback and admin grants land in the same customer balance as credit notes. Nothing records the funder on the wallet line. Expiry does not exist. A supplier-funded cashback does not reduce that supplier’s payable.

### Horeca1 revenue (Section G)

Commission, subscription, and a customer service fee are different incomes. Commission is recognised when the invoice is completed, then the payout screen reads it. Only an authorised adjustment may type revenue in by hand.

**Today:** commission and the Razorpay fee exist on the payable. There is no GST on commission, no subscription fee, and no customer platform fee. The sheet leaves GST blank. Do not invent a rate.

### Corrections (Section H)

Rare, never automatic, never used to place an order or pay a supplier. Every correction stores the person, a reason, and a reference. Write-off needs a second approver. Recovery points at the original write-off.

**Today:** supplier payable adjustments and credit-line admin actions exist in pieces. The customer wallet cannot be debited by admin. There is no shared reason-and-second-approver rule across books.

## 4. What the client’s list did not name

These are the gaps worth adding, in plain language.

1. **Money the gateway has, but our bank does not.** A successful Razorpay payment is not the same as cash in the bank. The payout screen already stores Razorpay’s fee. Keep that. Do not post “bank increased” on the payment-success event the way Section B’s bank column reads.
2. **GST on our commission.** The sheet has a blank row. Leave it blank until a CA gives the rate and who issues the invoice.
3. **TCS and TDS.** Not in the sheet. Do not build them until counsel confirms they apply.
4. **COD and bank transfer collected later.** The supplier is paid when that collection is recorded and the order is complete, not when the order is placed.
5. **One order, several funding sources.** The sheet allows a split. The app allows the spendable wallet plus one other method. A three-way split can wait.
6. **The old supplier wallet.** It is not one of the four books. It is a provisional copy of payout. Leave it in place until the payout book is the only screen people use, then stop the weekly job and the instant-payout button from moving money.

## 5. What not to build

- A second journal beside Phase 1 payables. Two books for “what we owe the supplier” will double-pay or drop orders.
- A pasted ledger kit that does not use `supplier_payable_lines`, `credit_wallets`, and `wallets`.
- Customer cash top-up, until the client says the wallet holds real money. If that day comes, spending it must count as collection or the supplier will be underpaid.
- Automatic interest, unless the client reverses the sheet. The sheet says overdue does not create a penalty by itself. The app currently does.
- Brand ledgers, subscriptions, banner ads, and GST returns. The sheet postpones them.

## 6. Screens

People should never have to know the words debit and credit to do their job. One finance home, four statements. Each statement is opening balance, lines, closing balance, and a link to the order.

**Admin home**

- Pay suppliers. Already `/admin/finance`. Add a column only when a line is held because the customer still owes that supplier.
- Customer credit. Two filters on the existing credit admin: “Supplier’s customer” and “DiSCCO”. Ageing is a status, not a new product.
- Wallets. New list: customer, spendable balance, promo balance if they are split, last movement. Grant and debit with a reason. This is not the credit page.

**Supplier**

- What I receive. Already `/vendor/receive`. This is the payout book.
- My customers’ credit. Already `/vendor/credit`. Show limit, available, outstanding, overdue. Do not show DiSCCO loans the supplier does not own.
- Remove the instant-payout action from the old wallet screen so it cannot pretend a bank payment happened.

**Customer**

- Credit. Keep `/wallet` for DiSCCO and supplier lines, dues, and repay. The title should say credit, not wallet.
- Spendable balance. Keep `/rewards` until the wallet is a real payment. Show each credit’s source: cashback, credit note, admin, promo. Do not mix this number with “you owe us”.

**Checkout**

- One sentence under the payment choice: “H1 balance spends what you already have. Horeca1 Credit is pay later.”
- Stop using the payment value `wallet` for credit. Use `horeca1_credit` in new orders and keep accepting the old value so existing orders still reverse correctly.

## 7. Build order

Do this on `demo`. Do not retune production payable maths while these decisions are open.

### Step 1 — Lock six decisions

See section 8. No schema until these are answered. Defaults below are what the team should use if the client does not answer within the build window.

### Step 2 — Make the payout book the only payout

- Point every admin and supplier payout action at Phase 1.
- Stop creating new legacy settlement batches and disable instant payout.
- Do not delete old rows. They stay as history.
- Add the supplier-credit hold: a delivered supplier-credit invoice stays out of “ready to pay” until that customer’s repayment is recorded. DiSCCO invoices stay eligible, because the lender owns the debt.
- Commission stays the Phase 1 figure already in production. Do not switch the base to the sample sheet’s 2% or 5%.

### Step 3 — Credit statements match the sheet

- Supplier credit and DiSCCO stay one engine, labelled by owner.
- Cancel and approved return always restore the line that funded the order.
- Write-off and recovery, with a second approver.
- Turn off automatic interest and late fees, or hide them, if the client confirms the sheet. Until they confirm, leave the cron as it is and do not add new penalty types.

### Step 4 — Wallet as its own book

- Keep one spendable balance until the client demands separate promo money.
- Tag every credit and debit with its source.
- Unique key so a grant, credit note, cashback, or cancel refund can post only once.
- Admin screen: search, statement, CSV, grant, debit, reason.
- Refund rule from the sheet: online refunds credit the wallet first, capped at what that payment collected. A later “send to my bank” action is a separate event. Do not do both automatically.

### Step 5 — Promotions name their funder

- Supplier-funded offers keep reducing the payable once.
- Horeca1-funded cashback stays our cost.
- Expiry of unused supplier-funded promo credit restores that supplier’s payable. It does not become Horeca1 income.

### Step 6 — Only if finance still asks for a general ledger

Add an append-only journal that is **written by** the events above and **never** used to calculate a second payout. Reports can sum it. Pay suppliers continues to use the payable lines.

## 8. Decisions to ask, and the default if they stay silent

| Question | Default so the build can continue |
| --- | --- |
| Does a DiSCCO sale get paid to the supplier on delivery? | Yes. The lender, not the supplier, owns the customer’s debt |
| Does a supplier-credit sale wait until the customer pays? | Yes. Hold that invoice only |
| Online refund: wallet first, or back to Razorpay? | Wallet first, as the sheet says. Bank refund only when the customer asks |
| Are promo rupees a separate balance from credit notes and cashback? | No. One spendable balance, with a source on each line |
| Do we charge interest when a credit line is overdue? | Leave the current cron untouched until they say stop |
| GST on commission, TCS, TDS, customer service fee? | Do not build. Rates are blank or absent |

## 9. How we know it is right

Use one invented order per funding source and follow it by hand. Paisa must match.

1. Online ₹1,000 delivered, commission as already configured, Razorpay fee stored. Payout = cash − fee − commission. Wallet unchanged.
2. Same order cancelled before delivery. Payout returns to zero. No second subtraction at settlement time.
3. Supplier credit ₹1,000 delivered. Customer owes the supplier ₹1,000. Payout shows held, not payable. Customer repays ₹400. ₹400 becomes payable. ₹600 stays held.
4. DiSCCO ₹1,000 delivered. Customer owes the lender ₹1,000. Supplier payout becomes payable. Repayment reduces the DiSCCO line and does not pay the supplier again.
5. ₹200 H1 balance spent on a ₹1,000 online order. Payable uses the ₹800 captured. Cancel restores ₹200 once.
6. ₹200 credit note. Wallet +200 once. Supplier payout falls by the note only if the original sale was cash that we owe the supplier. A retry does not add another ₹200.
7. Supplier-funded ₹50 off. Payable base is ₹50 lower once. Payout does not subtract ₹50 again.
8. Two people: the person who creates a payout batch cannot be the person who locks it.
9. A refund larger than the payment is rejected.
10. Existing payable tests still pass. No order is both in a finance batch and in a new legacy wallet batch.

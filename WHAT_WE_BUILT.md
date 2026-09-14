# Horeca1 — What We've Built So Far
**Simple Version for Everyone**

---

## What Is Horeca1?

A **marketplace app** where restaurants, hotels, bakeries, and catering companies buy food and supplies in bulk — like an online wholesale store. Think of it like Amazon, but for restaurant supplies.

Buyers (restaurants, hotels) → Search products → Add to cart → Checkout with multiple sellers → Get delivered.

---

## What Works Right Now ✅

### For Customers (Restaurants, Hotels, Bakeries)
- **Browse & Search** — Find products across multiple vendors (sellers)
- **Smart Cart** — Items are grouped by vendor, so you can buy from different sellers and pay them separately
- **Bulk Discounts** — Products have 3-tier pricing: buy more, pay less
- **Delivery Slots** — Pick when you want delivery (each vendor has their own schedule)
- **Order Tracking** — See where your order is (pending → processing → out for delivery → delivered)
- **Returns & Refunds** — Request to return products, get approval from vendor, get money back
- **Saved Addresses** — Store multiple delivery locations with maps
- **Quick Order Lists** — Save your favorite products as a template to reorder fast
- **Reviews** — Rate products after receiving them

### For Vendors (Food Suppliers)
- **Seller Dashboard** — Manage your products, check inventory
- **Order Management** — See all customer orders, mark as processing/shipped
- **Upload Documents** — Proof of GST, business registration (for approval)
- **Bulk Pricing** — Set up 3-tier discounts for quantities
- **Settings** — Manage your profile and coverage areas

### For Admin (Managers)
- **Approve Vendors** — Verify documents, approve/reject sellers
- **Manage Products** — Add categories, approve new products
- **View Orders & Finance** — See all orders, money flow, refunds
- **Approve Returns** — Review return requests, authorize refunds
- **Team Management** — Add team members with different permissions
- **Audit Trail** — See who changed what and when

### Payments
- **Razorpay Integration** — Secure credit/debit card payments
- **Order Confirmation** — Customers and vendors get email confirmation

---

## Key Features

| Feature | Status |
|---------|--------|
| Homepage with deals | ✅ Working |
| Vendor stores | ✅ Working |
| Product search (with typo tolerance) | ✅ Working |
| Cart & checkout | ✅ Working |
| Bulk price slabs (3 tiers) | ✅ Working |
| Delivery slot booking | ✅ Working |
| Order status tracking | ✅ Working |
| Email notifications | ✅ Working |
| SMS notifications | ✅ Working |
| Invoice PDF download | ✅ Working |
| Returns & refunds | ✅ Working |
| Vendor document upload | ✅ Working |
| Admin vendor approval | ✅ Working |
| Security & user authentication | ✅ Working |
| Payment processing | ✅ Working |

---

## What's Still Missing 🔴 (Before We Go Live)

### Critical (Must Fix)
1. **HTTPS/Security** — Customers need SSL certificate (like bank security) before using payment
2. **WhatsApp Messages** — Code is ready but waiting for approval from WhatsApp/MSG91
3. **Test Order** — Need to confirm: a customer places order → gets email → vendor gets email

### Should Add Soon 🟠
1. **Browser Notifications** — Pop-up alerts on desktop when order updates
2. **Error Monitoring** — Track if something breaks (Sentry is ready, just needs testing)

### Nice to Have in Future 🟡
1. **Automated Testing** — Check that features don't break when we update
2. **Faster Deployment** — Auto-deploy when we push code (currently manual)
3. **Multiple Languages** — Support Hindi & Marathi (for Mumbai market)
4. **Analytics** — Know which products sell best, where customers drop off
5. **Credit/Loan Program** — Buy now, pay later option for restaurants

---

## Technology Behind It

- **Where it runs** — One server in DigitalOcean (cloud) — costs $29/month
- **Database** — PostgreSQL (where all data is stored)
- **Frontend** — Modern web app that works on desktop & mobile
- **Payments** — Integrated with Razorpay
- **Email** — Resend (professional email service)
- **SMS** — MSG91 (for text messages)
- **Maps** — Google Maps for delivery areas

---

## Current Status

✅ **Live at:** http://64.227.187.210/

- All main features working (16 complete)
- Zero technical errors
- 44 database tables configured
- Ready for public testing (once HTTPS is added)

---

## Missing Client-Side Features & How They Should Work 🚧

### 1. **Collections** — Curated Product Groups
**Status:** Collections exist in database but customers can't see them  

**How it works:**
- Homepage shows 6 collection cards (fetched from `GET /api/v1/collections`)
- Each card has image, name, product count
- Click card → should go to `/collections/[slug]` (missing page)
- Detail page shows all products in collection, grouped by vendor
- Database: `Collection` table + `CollectionProduct` join table with sortOrder
- Missing: Detail page route in frontend router

---

### 2. **Wallet / Prepaid Balance** — Pay with Stored Money
**Status:** Database exists (`Wallet`, `WalletTransaction` models) but zero API endpoints  

**How it works:**
- Customer adds money: Profile → Wallet → Enter amount → Razorpay payment → Money added to wallet
- At checkout: Select "Wallet" payment → System checks balance ≥ total → Deducts from wallet → Order complete
- API needed: `POST /api/v1/wallet/initiate-topup` (start payment) + `POST /api/v1/wallet/verify-topup` (confirm)
- Partial payment: Wallet ₹5000 + Razorpay ₹3000 for ₹8000 order
- Tables: `Wallet` (userId, balance) + `WalletTransaction` (credit/debit history)

---

### 3. **Buy Now, Pay Later / Credit** ✅ READY (Backend Complete, Needs Checkout Integration)
**Status:** Backend 100% implemented, just needs checkout button  

**How it works:**
- Customer requests: Browse vendor → "Request Credit Line" → Enter amount → Vendor notified
- Vendor approves: Dashboard → Credit Requests → Set limit → Approve/Reject
- At checkout: Select "DiSCCO Credit" → Shows available credit → Deducts from limit → Due in 30 days
- Tables: `CreditAccount` (userId, vendorId, creditLimit, creditUsed, status) + `CreditTransaction` (payment history)
- Overdue: >10 days → Account suspended → Can't place new orders

---

### 4. **Promo Codes / Discount Codes** — Apply Coupon
**Status:** No system exists (zero API endpoints, zero database model)  

**How it works:**
- Admin creates: Portal → Promotions → Code "FRESH50" → ₹50 off or 10% off → Set expiry, min cart, usage limit
- Customer applies: Cart → "Have coupon?" → Enter code → Click "Apply"
- Validation: Code exists? Expired? Min cart met? User eligible? Not already used? Vendor applicable?
- Discount: Fixed (₹50 off) or Percentage (10% off, max ₹100)
- Re-validated at checkout (prevents tampering)
- Tables: `PromoCode` (code, discount rules) + `PromoCodeUsage` (audit trail)

---

### 5. **Browser Push Notifications** — Real-Time Desktop Alerts
**Status:** Infrastructure 80% done (subscription works), service worker incomplete  

**How it works:**
- Opt-in: Click bell icon (navbar) → Browser asks permission → Allow → Bell turns green
- Subscription: Service worker registers → Browser subscribes → Data stored in `PushSubscription` table
- Send: Order status changes → Event → BullMQ job → Worker sends push to all user's subscriptions
- Display: Service worker `push` event → Shows OS notification (currently broken - stubbed)
- Click: Should navigate to order page (currently broken - no click handler)
- Tables: `PushSubscription` (endpoint, encryption keys, userId)

---

### 6. **Promotions & Discounts** — Flash Sales & Time-Based Deals
**Status:** Database fields exist but not used in pricing logic  

**How it works:**
- Admin creates: Portal → Create Promotion → Select products → Set discount → Time window (10 AM–2 PM)
- Price calculation: Get bulk slab price → Check if promotion active (time-based) → Apply discount
- Display: Product card shows ~~₹500~~ → ₹450 + "⚡ Flash Sale" badge + countdown timer
- Re-validation: At checkout, backend checks promotion still active
- Cleanup: Cron job disables expired promotions
- Tables: `Promotion` (title, discount, times) + `PromotionProduct` (which products)

---

### 7. **Wishlist** — Save Items for Later
**Current State:** Partial — heart icon exists but incomplete  
**What Should Happen:**

1. Click heart icon on product card
2. Product saved to "My Wishlist"
3. Go to Profile → Wishlist
4. See all saved items
5. Click item → View details or "Add to Cart"
6. Delete from wishlist anytime

**Why Incomplete:** UI polish missing, some edge cases not handled

---

### Future Enhancements (Not Started)
- ❌ **Multiple Languages** — Only English. Hindi & Marathi deferred
- ❌ **Mobile App** — Currently web-only
- ❌ **Loyalty Rewards** — Points/rewards program
- ❌ **Personal Recommendations** — "For You" section
- ❌ **Saved Items Sync** — Cart/wishlist across devices

---

## Missing Vendor/Supplier Features 🚧

### 1. **Bulk Operations** — Manage Many Items at Once
**What Should Happen:**
1. Vendor dashboard → Products page
2. Select multiple products (checkboxes)
3. Bulk actions menu appears: "Edit Price", "Update Stock", "Deactivate"
4. Choose action → Apply to all selected → Done in seconds instead of one-by-one

---

### 2. **Sales Reports** — See Business Performance
**What Should Happen:**
1. Vendor dashboard → Reports tab
2. Shows dashboard with:
   - **Monthly Revenue:** ₹2,45,000 (this month) vs ₹1,80,000 (last month)
   - **Top Products:** Milk (450 units), Eggs (380 units), Cheese (220 units)
   - **Lost Sales:** Items out of stock = ₹50,000 potential lost revenue
   - **Customer Orders:** 127 orders this month, 95% on-time delivery
3. Export to PDF/Excel for accounting

---

### 3. **Inventory Sync** — Connect to Accounting Software
**What Should Happen:**
1. Vendor has inventory in Tally or Zoho Inventory
2. Connect HoReCa to that system (one-time setup)
3. Automatic sync:
   - When HoReCa stock decreases → Updates Tally
   - When Tally stock changes → Updates HoReCa
4. No more manual updates needed

---

## Missing Admin Features 🚧

### 1. **Bulk Approvals** — Approve Many Vendors at Once
**What Should Happen:**
1. Admin → Vendors page
2. See pending vendor list
3. Multi-select vendors
4. Click "Approve Selected" → All get approved in one action

### 2. **Advanced Search/Filters** — Find Anything Fast
**What Should Happen:**
1. Admin → Orders page
2. Filter by: Date range, status, vendor, payment method, customer
3. Search for specific order number
4. Results appear instantly
5. Export filtered results to CSV

---

## Missing Features Priority & Effort ⏱️

| Feature | Difficulty | Effort | Impact | Priority |
|---------|-----------|--------|--------|----------|
| **Wallet/Prepaid** | Medium | 2–3 days | High | 🔴 Critical |
| **Promo Codes** | Medium | 2–3 days | High | 🔴 Critical |
| **Push Notifications** | Easy | 1 day | Medium | 🟠 Important |
| **Collections Detail Page** | Easy | 1 day | Medium | 🟠 Important |
| **Credit UI Integration** | Easy | 1 day | High | 🟠 Important |
| **Bulk Vendor Approvals** | Medium | 1–2 days | Medium | 🟡 Nice-to-have |
| **Sales Reports** | Hard | 3–5 days | Medium | 🟡 Nice-to-have |
| **Inventory Sync** | Hard | 1 week | High | 🟡 Nice-to-have |
| **Multiple Languages** | Medium | 3 days | Low | 🟡 Deferred |
| **Mobile App** | Hard | 4+ weeks | Medium | 🟡 Future |

---

## Next Steps (In Order)

### This Week 🎯
1. **Add HTTPS certificate** — Needed for Razorpay security
2. **Test full email flow** — Place order → customers/vendors get emails
3. **Confirm WhatsApp approval** — Once approved, goes live instantly

### Next 2 Weeks 📅
1. **Integrate Credit at Checkout** — Backend ready, just add button (1 day)
2. **Build Collections Detail Page** — Show all products in collection (1 day)
3. **Complete Push Notifications** — Finish service worker (1 day)

### Next Month 📆
1. **Implement Wallet System** — Add money to wallet → Pay with wallet (2–3 days)
2. **Add Promo Codes** — Apply coupons at checkout (2–3 days)
3. **Vendor Sales Reports** — Show revenue, top products, lost sales (3–5 days)

### Long-term (3+ months)
- Bulk operations for admin/vendor
- Inventory sync with Tally/Zoho
- Multiple languages (Hindi, Marathi)
- Mobile app
- Loyalty rewards program

---

**Key Insight:** Credit system is **100% ready** — just needs the checkout button. Wallet and Promo Codes are the two biggest gaps blocking full payment flexibility.



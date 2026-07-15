# E2E Defect Ledger

## Gap pass — 2026-07-15 (launch close-out)

**Live image:** `9e4398b` (`ghcr.io/team-horeca1/horeca1:9e4398b123bc222c59c1c463a02c844f1e2f67dd`)  
**Ship commit:** strip Wishlist/WhatsApp + P2-08/09/10 polish  
**Process:** Phase A–C → deploy → gap E2E (register/create, teams/RBAC, commissions, regression)

### What shipped in `9e4398b`

| Area | Change |
|------|--------|
| Wishlist | Removed page, provider, hearts, footer/nav links, overlay; `/wishlist` → **404** |
| WhatsApp | Removed vendor prefs column; SMS-only reminder copy; stop enqueueing `whatsapp` in credit reminders |
| P2-08 | Profile seeds session name + skeleton until `/auth/me` |
| P2-09 | Vendor store settings **Admin View — read only** (MOV locked) |
| P2-10 | Brand register labels “Already signed in · OTP step skipped” when authenticated |
| PDP | Removed accidental `router.replace('/')` that broke product pages |

### Gap E2E matrix

| Pack | Status | Evidence |
|------|--------|----------|
| D1 Customer `/register?role=customer` OTP UI (Mobile/Email + Send OTP); abandon OK | **PASS** | Live UI |
| D1 Vendor `/vendor/register` OTP step 1 | **PASS** | Live UI |
| D1 Brand `/brand/register` public OTP UI | **PASS** | Live UI |
| D1 Admin create customer disposable | **PASS** | `E2E Gap Customer 1784128786672` |
| D1 Admin create brand disposable | **PASS** | `E2E Gap Brand 1784128786672` |
| D1 Admin create vendor + service area on primary outlet | **PASS** | `E2E Gap Vendor 1784128843394` · area `400705` → outlet |
| D2 Customer BA invite Viewer; Viewer cannot `users.create` | **PASS** | `E2E Viewer2…` invite OK; Viewer login → **FORBIDDEN** `Requires users.create` |
| D2 Vendor invite Warehouse Manager; inventory OK; settings.edit denied | **PASS** | `E2E Warehouse…`; inventory 200; PATCH settings **FORBIDDEN** |
| D2 Brand invite Marketing Executive; read OK / write denied | **PASS** | `E2E Marketing…`; GET products 200; POST **FORBIDDEN** `products.create` |
| D2 Admin Support Agent role lacks settings/users.create interesting perms | **PASS** | Admin roles: Support Agent interesting `[]` |
| D2 Exit Admin View / banners show impersonated entity | **PASS** | Vendor banner “Patel Enterprise”; customer “viewing as Mandar Shetty” |
| D3 Admin settings `defaultCommissionPct` load | **PASS** | `10` |
| D3 Patel vendor detail + Admin View settings MOV | **PASS** | MOV 1000; UI “ADMIN VIEW — READ ONLY” |
| D3 Vendor Sales Team tabs (Salespersons/Rules/Commissions); no fake bank-payout promise | **PASS** | Live UI under Admin View |
| D3 Product Platform Commission labeled metadata | **PASS** | Copy in vendor/admin product forms |
| D4 Logout → `/api/v1/auth/me` **401** | **PASS** | Profile Logout UI + cookie-jar API |
| D4 No Wishlist / WhatsApp in footer, product surfaces, vendor prefs | **PASS** | `/wishlist` 404; prefs channels App Push/SMS/Email only |
| D4 Mobile 390: home + cart | **PASS** | Emulated 390×844 |

### Closed polish (was open P2)

| ID | Status |
|----|--------|
| P2-08 Profile flash | **CLOSED** |
| P2-09 MOV under Admin View | **CLOSED** |
| P2-10 Brand register OTP UX | **CLOSED** (auth-mode labeled) |
| P2-13 Wishlist API 404 | **CLOSED** (UI removed; route gone) |

### Open P0 / P1

**None.**

### Intentional non-claims

- Live Razorpay **successful charge**
- Automated salesman **bank payout**
- Product `platformCommission` driving settlement math
- Exhaustive admin report-chart pixels
- Historical `outletId: null` service-area backfill
- AneeVerse Deploy secret (prod = team-horeca1)

---

## Production run — 2026-07-15 (batch QA — prior)

**Process:** Test all packs → log → fix P0/P1 once → deploy → retest.  
**Target:** `https://freshville.store`  
**Live image at that time:** `3422e1e`  
**Pack gate SHA:** `def475d` · **Logout fix SHA:** `3422e1e`  

### Fixture map

| Actor | Identity | Notes |
|-------|----------|-------|
| Admin | `admin@horeca1.com` / `admin123` | |
| Customer | Mandar Shetty — Rasoi | Admin Impersonate `f5a8c8c7-…` |
| Vendor | Patel Enterprise | `241d56ce-…f6b0` / owner `2ba7417a-…` |
| Brand | Sarwar | `7884eccc-…` |
| Disposable | E2E Viewer; E2E Sales; E2E Marketing; gap-pass creates `E2E Gap *` / Viewer2 / Warehouse / Marketing | leave labeled |

### Prior defect ledger (historical)

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| P1-01 | Admin→Customer | P1 | Account team BA | Wrong BA under Admin View | Prefer URL/`/api/v1/account` | shipped | **PASS** |
| P1-02 | Admin→Vendor | P1 | Vendor notifications | Admin userId | `resolveVendorNotificationUserId` | shipped | **PASS** |
| P2-01–07 | — | P2 | various | prior | — | shipped / DB | **PASS** |
| P2-08 | Admin→Customer | P2 | Profile flash empty | Brief “Hi there” | skeleton + session seed | **CLOSED** `9e4398b` | **PASS** |
| P2-09 | Admin→Vendor | P2 | Settings MOV | Editable under Admin View | read-only + cue | **CLOSED** `9e4398b` | **PASS** |
| P2-10 | Brand | P2 | `/brand/register` | No OTP when logged-in add-brand | labeled auth flow | **CLOSED** `9e4398b` | **PASS** |
| P2-11 | Vendor | P2 | Mobile inventory | Dense toolbar | `flex-wrap` | shipped | **PASS** @390 |
| P2-12 | Auth | **P1** | Logout | `/auth/me` stayed 200 | cookie-clear logout | `3422e1e` | **PASS** (reconfirmed gap pass) |
| P2-13 | Customer | P2 | Wishlist API | `/api/v1/wishlist` 404 | removed wishlist UI | **CLOSED** `9e4398b` | n/a |
| D5 | Ops | P2 | CI Deploy | team-horeca1 | secret restored | **PASS** | |

### Launch verdict

**Launch-complete for the agreed bar:** core buy/sell/admin + gap packs (register/create, teams/RBAC, commission smoke, logout, Wishlist/WhatsApp stripped). No open P0/P1.

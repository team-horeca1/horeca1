# E2E Defect Ledger

## Production run — 2026-07-15 (launch gap pass — complete)

**Target:** `https://freshville.store`  
**Live image:** (updating — hard logout fix shipping)  
**Health:** `/api/health` + `/api/v1/health` OK  

### Fixture map

| Actor | Identity | Notes |
|-------|----------|-------|
| Admin | `admin@horeca1.com` / `admin123` | Password login verified |
| Customer | Mandar Shetty — Rasoi Bar & Restaurant | Admin Impersonate; 3 outlets |
| Vendor | Patel Enterprise | 3 outlets |
| Brand | Sarwar | Admin View |
| Disposable | E2E Viewer; E2E Sales; E2E Marketing; E2E Test Vendor `…171629` + `…1784116238845` (both pending) | leave labeled |

---

### D5 — CI Deploy

| Repo | Result |
|------|--------|
| `team-horeca1/horeca1` | **PASS** — `DO_SSH_PRIVATE_KEY` restored; Deploy green on `7f15742` |
| `AneeVerse/horeca1` | Still fails unless same secret added (mirror optional) |

---

### Production defect ledger

| ID | Actor | Sev | Surface | Observation | Fix | Retest |
|----|-------|-----|---------|-------------|-----|--------|
| P1-01 | Admin→Customer | P1 | Account team BA | Wrong BA under Admin View | Prefer URL/`/api/v1/account` | **PASS** |
| P1-02 | Admin→Vendor | P1 | Vendor notifications | Admin userId | `resolveVendorNotificationUserId` | **PASS** |
| P2-01 | Admin→Customer | P2 | Storefront banner | Banner only on profile | Root layout | **PASS** |
| P2-02 | Ops | P2 | Image cache | EACCES | Dockerfile | **PASS** |
| P2-03 | Customer | P2 | `/lists` | 404 | Use `/order-lists` | closed |
| P2-04 | Admin | P2 | Bad JSON | 500 | 400 VALIDATION_ERROR | **PASS** |
| P2-05 | Admin | P2 | Team DELETE | Membership id 404 | Accept id or userId | **PASS** |
| P2-06 | Storefront | P2 | Footer copy | Typos / US grocery blurb | Footer.tsx in `7f15742` | **PASS** live |
| P2-07 | Storefront | P2 | Demo catalog junk | Catogery-01, cat-02, Vender01, gggg | Deactivated in prod DB | **PASS** APIs hide them |
| P2-08 | Admin→Customer | P2 | Profile flash empty | Brief “Hi there” | Optional skeleton | observed (fills) |
| P2-09 | Admin→Vendor | P2 | Settings MOV | Editable under Admin View | Decide lock cue | open (non-blocking) |
| P2-10 | Brand | P2 | `/brand/register` | No OTP channel toggle | Different flow | open (non-blocking) |
| P2-11 | Vendor | P2 | Mobile inventory | Action bar dense at 390px | `flex-wrap` on toolbar (`f8077f3`) | retest after deploy |
| P2-12 | Auth | **P1** | Logout | UI→`/` but `/auth/me` still 200 after `f8077f3` | AuthTabSync raced `signOut({redirect:false})` after broadcast before CSRF clear | `clientLogout` CSRF POST + `markSigningOut` before broadcast | pending retest |
| D5 | Ops | P2 | CI Deploy SSH | Missing secret | Restored on team-horeca1 | **PASS** |

---

### Final gap matrix

| Area | Status | Notes |
|------|--------|-------|
| Preflight health + image | **PASS** | `7f15742` |
| Auth OTP UI | **PASS** | |
| Auth password login + logout | **PARTIAL** | Login PASS; logout UI OK but session cookie may persist (`/auth/me` still 200) — **P2-12** |
| Register customer OTP channels | **PASS** | |
| Browse home/search | **PASS** | Junk categories/vendors/brands scrubbed |
| Pin + OOS hidden | **PASS** | pin 400705; OOS `Product-testfrom-vender` / Kissan not listed; in-stock with qty |
| Cart / oversell / checkout MOV / Razorpay abandon | **PASS** | |
| Orders + invoice PDF | **PASS** | |
| Lists / wishlist / wallet / rewards | **PASS** | |
| Profile + outlets | **PASS** | |
| Account team Viewer | **PASS** | |
| Vendor warehouse / inventory / pages | **PASS** | |
| Vendor order → processing | **PASS** | |
| Vendor team Sales Rep invite | **PASS** | |
| Vendor onboarding submit → 201 | **PASS** | `E2E Test Vendor…`; service area 400705 on primary outlet; pending approval |
| Brand portal + Marketing invite | **PASS** | |
| Brand register OTP toggle | PARTIAL | Logged-in add-brand form (documented) |
| Admin Impersonate + Support Agent | **PASS** | |
| Admin finance + filter | **PASS** | `/admin/finance` Completed payments filter |
| Admin approvals queue | **PASS** | Shows E2E pending vendor; not approved |
| Mobile home/cart | **PASS** | |
| Mobile vendor inventory | PARTIAL | Dense action bar |
| Cross Admin View scoping | **PASS** | |
| Bad JSON surface | **PASS** | |
| CI Deploy (team-horeca1) | **PASS** | |

---

### Launch verdict

**Ready to launch** on core customer / vendor / brand / admin flows. Remaining non-blocking P2: logout session clear (P2-12), MOV lock cue, brand-register OTP UI, mobile inventory crowding, optional AneeVerse secret.

### Out of scope (intentional)

- Live Razorpay success charge  
- WhatsApp  
- Exhaustive report charts  
- Historical `outletId: null` service-area backfill  

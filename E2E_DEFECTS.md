# E2E Defect Ledger

## Production run — 2026-07-15 (batch QA mode)

**Process:** Test all → log → fix P0/P1 once → deploy once → retest.  
**Target:** `https://freshville.store`  
**Pack gate SHA:** `def475d` (CI Deploy success)  
**Health:** OK  

### Fixture map

| Actor | Identity | Notes |
|-------|----------|-------|
| Admin | `admin@horeca1.com` / `admin123` | |
| Customer | Mandar Shetty — Rasoi | Admin Impersonate `f5a8c8c7-…` |
| Vendor | Patel Enterprise | `241d56ce-…` / owner `2ba7417a-…` |
| Brand | Sarwar | `7884eccc-…` |
| Disposable | E2E Viewer; E2E Sales; E2E Marketing; `e2e-support-1784118814687@example.com`; pending `E2E Test Vendor…` | leave labeled |

---

### Production defect ledger

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| P1-01 | Admin→Customer | P1 | Account team BA | Wrong BA under Admin View | Prefer URL/`/api/v1/account` | shipped | **PASS** |
| P1-02 | Admin→Vendor | P1 | Vendor notifications | Admin userId | `resolveVendorNotificationUserId` | shipped | **PASS** (`/vendor/notifications`) |
| P2-01–07 | — | P2 | various | prior run | — | shipped / DB | **PASS** |
| P2-08 | Admin→Customer | P2 | Profile flash empty | Brief “Hi there” | Optional skeleton | open | non-blocking |
| P2-09 | Admin→Vendor | P2 | Settings MOV | Editable under Admin View | Decide lock cue | open | non-blocking |
| P2-10 | Brand | P2 | `/brand/register` | No OTP channel UI (logged-in add-brand form) | Different flow | open | **FAIL** on pack (documented) |
| P2-11 | Vendor | P2 | Mobile inventory | Dense toolbar | `flex-wrap` on `def475d` | shipped | **PASS** (toolbar wraps at 390) |
| P2-12 | Auth | **P1** | Logout | Profile Logout → `/` but `/auth/me` still **200** on `def475d` | Form/fetch signout flaky | `POST /api/v1/auth/logout` clears auth cookies + clientLogout | pending deploy |
| P2-13 | Customer | P2 | Wishlist API | `/api/v1/wishlist` → 404; page 200 | Route alias / missing | open | non-blocking |
| D5 | Ops | P2 | CI Deploy | team-horeca1 | secret restored | **PASS** | |

---

### Pass matrix — packs on `def475d`

| Area | Status | Notes |
|------|--------|-------|
| Preflight health + image | **PASS** | `def475d` |
| Auth password login | **PASS** | |
| Auth logout → me 401 | **FAIL** | **P2-12** |
| Register OTP channels | **PASS** | customer |
| Browse / pin / OOS hide | **PASS** | |
| Cart ≥3 / oversell / checkout MOV | **PASS** | oversell 400 OUT_OF_STOCK; Razorpay abandoned |
| Orders + invoice PDF | **PASS** | |
| Lists / wallet / rewards | **PASS** | wishlist API 404 = P2-13 |
| Profile outlets + account team | **PASS** | |
| Vendor portal + notifs scope | **PASS** | |
| Brand portal pages | **PASS** | register OTP = P2-10 |
| Admin portal APIs | **PASS** | 24/24 |
| Cross (bad JSON, mobile, scope) | **PASS** | |
| CI Deploy (team-horeca1) | **PASS** | |

### Pack agents

- Customer/vendor/brand: completed on `def475d`
- Admin/cross: completed on `def475d`

---

### Launch verdict (pre fix-batch)

**Blocked on P2-12 (logout session clear).** All other launch-critical packs PASS. Open P2 backlog only after logout closed.

### Out of scope

- Live Razorpay success · WhatsApp · report-chart pixels · historical service-area backfill · AneeVerse Deploy

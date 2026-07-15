# E2E Defect Ledger

## Production run — 2026-07-15 (batch QA — complete)

**Process:** Test all packs → log → fix P0/P1 once → deploy → retest.  
**Target:** `https://freshville.store`  
**Live image:** `3422e1e` (CI Deploy success on `team-horeca1`)  
**Pack gate SHA:** `def475d` · **Logout fix SHA:** `3422e1e`  

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
| P1-02 | Admin→Vendor | P1 | Vendor notifications | Admin userId | `resolveVendorNotificationUserId` | shipped | **PASS** |
| P2-01–07 | — | P2 | various | prior | — | shipped / DB | **PASS** |
| P2-08 | Admin→Customer | P2 | Profile flash empty | Brief “Hi there” | Optional skeleton | open | non-blocking |
| P2-09 | Admin→Vendor | P2 | Settings MOV | Editable under Admin View | Decide lock cue | open | non-blocking |
| P2-10 | Brand | P2 | `/brand/register` | No OTP channel UI (logged-in add-brand) | Different flow | open | documented |
| P2-11 | Vendor | P2 | Mobile inventory | Dense toolbar | `flex-wrap` | shipped | **PASS** @390 |
| P2-12 | Auth | **P1** | Logout | `/auth/me` stayed 200 after Profile Logout | Form/fetch races; UI never hit cookie clear | `POST /api/v1/auth/logout` + ProfileScreen calls `clientLogout` first (`3422e1e`) | **PASS** UI logout → me **401** |
| P2-13 | Customer | P2 | Wishlist API | `/api/v1/wishlist` 404 | Missing/alias route | open | non-blocking |
| D5 | Ops | P2 | CI Deploy | team-horeca1 | secret restored | **PASS** | |

---

### Pass matrix (final)

| Area | Status | Notes |
|------|--------|-------|
| Preflight health + image | **PASS** | live `3422e1e` |
| Auth password login | **PASS** | |
| Auth logout → me 401 | **PASS** | retested on `3422e1e` |
| Register OTP channels | **PASS** | |
| Browse / pin / OOS hide | **PASS** | |
| Cart / oversell / checkout MOV | **PASS** | Razorpay abandoned |
| Orders + invoice PDF | **PASS** | |
| Lists / wallet / rewards | **PASS** | wishlist API = P2-13 |
| Profile outlets + account team | **PASS** | |
| Vendor portal + notifs scope | **PASS** | |
| Brand portal pages | **PASS** | register OTP = P2-10 |
| Admin portal APIs | **PASS** | |
| Cross (bad JSON, mobile, scope) | **PASS** | |
| CI Deploy (team-horeca1) | **PASS** | |

### Launch verdict

**Ready to launch** on core flows. Open P2 backlog only: profile flash (P2-08), MOV lock cue (P2-09), brand-register OTP UI (P2-10), wishlist API 404 (P2-13). Optional AneeVerse Deploy secret.

### Out of scope

- Live Razorpay success · WhatsApp · report-chart pixels · historical service-area backfill · AneeVerse Deploy

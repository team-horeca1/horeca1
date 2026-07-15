# E2E Defect Ledger

## Production run — 2026-07-15

**Target:** `https://freshville.store`  
**Health:** `/api/health` healthy (db ok); `/api/v1/health` db+redis ok  
**origin/master tip:** `9ae1df2` (`fix(seed): align service areas and inventory with outlet-scoped uniques`)  
**Droplet `/opt/horeca1` git:** `bbf7732`  
**Running image:** `ghcr.io/team-horeca1/horeca1:latest` digest `sha256:aed618a98362…` (built ~2026-07-15 09:17 UTC) — note tip SHA vs droplet git may diverge; verify after each deploy.

### Fixture map

| Actor | Identity | Notes |
|-------|----------|-------|
| Admin | HoReCa Admin / Platform Admin | `admin@horeca1.com` |
| Customer | Mandar Shetty — `saketsuman@rediffmail.com` — Rasoi Bar & Restaurant | Admin Impersonate |
| Vendor | Patel Enterprise — Chirag Patel — `saket@horeca1.com` | 3 outlets (Brothers / Enterprise / Kirana); Admin Impersonate |
| Brand | Sarwar — Sohail Ansari — `saket@red.org.in` | Admin Impersonate |
| Disposable | `E2E Viewer` on Mandar BA; `E2E Support Agent` admin invite left labeled | |

### Production defect ledger

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| P1-01 | Admin→Customer | P1 | `/profile/team` TeamPanel | Under Mandar Admin View, team showed admin BA (HoReCa Admin) not Mandar + E2E Viewer | JWT `activeBusinessAccountId` ignored URL/`accountId` + impersonation BA | Prefer URL accountId, else `/api/v1/account` under impersonation | pending deploy |
| P1-02 | Admin→Vendor | P1 | `/api/v1/vendor/notifications` | Under Patel Admin View, feed returned admin `userId` notifications | Route used `ctx.userId` (admin JWT) | `resolveVendorNotificationUserId` → vendor owner | pending deploy |
| P2-01 | Admin→Customer | P2 | Storefront layout | Admin View banner only on `/profile` | Banner only on profile page | Mount in root layout | pending deploy |
| P2-02 | Ops | P2 | Next image cache | `EACCES mkdir /app/.next/cache` in logs | Container cache perms | open | open |
| P2-03 | Customer | P2 | `/lists` | 404 when probing wrong URL | Correct route `/order-lists` | none | **closed** |
| P2-04 | Admin | P2 | Bad JSON POST | Malformed body → 500 INTERNAL_ERROR | JSON parse not mapped to 400 | open | open |
| P2-05 | Admin | P2 | DELETE `/api/v1/admin/team/:id` | Cleanup after Support Agent invite → 404 “not found not found” | Delete path/id mismatch | open | open |
| D5 | Ops | P2 | GH Actions Deploy | Needs `DO_SSH_PRIVATE_KEY` | Secret missing | SSH `deploy.sh` fallback | open |

### Pass matrix (production)

| Pack | Result |
|------|--------|
| Preflight | PASS — health ok; fixtures Mandar / Patel (3 outlets) / Sarwar |
| Customer | PASS* — auth session via Admin View; browse/search/vendor+pin; cart ≥3 + oversell 400; checkout MOV caption correct; Razorpay Test Mode opened then abandoned; orders list/detail; invoice PDF 200; profile/outlets; team blocked by P1-01 until deploy |
| Vendor | PASS — Admin View banner; warehouse switch; dashboard; inventory PATCH with outletId; order pending→confirmed; products Add Product cancel no Untitled; warehouse/returns/claims/settings/team/notifications pages 200 |
| Brand | PASS — Sarwar portal home/products/analytics/team/settings/distributors pages 200; `/brand/register` form opens |
| Admin | PASS — all portal pages 200; Support Agent invite 201; Impersonate customer+vendor+brand banners readable |
| Cross-cutting | PASS* — customer cart/checkout under Admin View (orders owned by Mandar); customer notif APIs already scoped; vendor notif P1-02 fixed pending deploy; bad POST message present; mobile viewport ~774px spot-check OK |

\*After deploy: retest P1-01 team list + P1-02 vendor notifications + P2-01 banner on home.

### Out of scope (documented)

- Live Razorpay success charge
- WhatsApp channel
- Exhaustive report chart pixels
- Historical `outletId: null` service-area backfill

---

## Prior local Docker run

Verified against **local Docker** (`localhost:3000` + compose postgres/redis) with seeded fixtures. Production left online (health 200); no further prod stop/rebuilds.

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| D1 | Admin→Customer | P1 | BA team users/roles APIs | 403 under customer Admin View | Missing impersonation bypass | `assertCanMutateAccount` | **PASS** local (users 200, invite Viewer 201) |
| D2 | Storefront | P2 | FeatureBar | US shipping copy | Placeholder | India-relevant blurbs | **PASS** local + earlier prod image |
| D3 | Checkout | P1 | Summary caption | “You pay ₹0 for 0 items” below MOV | Selected groups empty while cart has lines | `paymentLockedByMov` caption + included totals | **PASS** local (`Cart ₹90 · 1 item — meet vendor minimums to pay`) |
| D4 | Admin→Customer | P1 | Cart UI vs API | Cart empty in UI while API had items | CartContext ignored impersonation changes | Reload on impersonation event; skip admin LS persist | **PASS** local (badge/checkout after signal) |
| D5 | Ops | P2 | GitHub Actions Deploy | Deploy job fails | Missing `DO_SSH_PRIVATE_KEY` | Add secret / SSH `deploy.sh` after GHCR build | open |
| D6 | Local | P2 | `prisma/seed.ts` | Seed broke on multi-outlet uniques | Stale `vendorId_pincode` / inventory keys | Seed outlets + `vendorId_outletId_*` | **PASS** seed completes |

## Pass matrix (local Docker)

| Pack | Result |
|------|--------|
| Preflight fixtures | PASS (admin/vendor/customer/brand seed) |
| Customer (via Admin View) | PASS — team list/invite, cart add, checkout MOV copy |
| Vendor / Brand / Admin pages | Prior prod smoke PASS; local smoke seed users OK |
| Cross-cutting | PASS — mobile home layout, MOV unlock messaging; payment abandon deferred (no live Razorpay on local) |
| Prod uptime | PASS — left running during local work |

## Deploy note

Pushed to GitHub: account + checkout + cart fixes. **Do not** stop prod for on-box rebuilds. Prefer CI image build + `deploy.sh` swap (needs `DO_SSH_PRIVATE_KEY`), or brief `--force-recreate` only after image exists.

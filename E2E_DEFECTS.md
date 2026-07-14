# E2E Defect Ledger

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

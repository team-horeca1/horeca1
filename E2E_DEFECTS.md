# E2E Defect Ledger (prod audit)

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| D1 | Admin→Customer | P1 | `GET/POST /api/v1/account/[id]/users` (+ roles, password, roleId) | 403 “not a member” under customer Admin View | Team routes used `assertAccountPermission` / member check without impersonation bypass | `assertCanMutateAccount` on users/roles/password/roleId routes | pending deploy |
| D2 | Storefront | P2 | Homepage FeatureBar | “Free shipping all over the US” copy | Placeholder copy | India-relevant feature blurbs | pending deploy |
| D3 | Ops | P2 | GitHub Actions Deploy | Deploy job fails; missing `DO_SSH_PRIVATE_KEY` | Secret not set in repo | Manual SSH `deploy.sh` until secret added | noted |

## Pack results (pre-fix SHA `bbf7732`)

- Customer: PASS (auth smoke via Admin View, browse/pin/cart/oversell, orders/invoice)
- Vendor: PASS (warehouses, inventory outletId, pages, team API list)
- Brand: PASS (impersonate + portal pages)
- Admin: PASS (dashboard/pages load; Support invite needs fresh post-fix retest)
- Account team under Admin View: FAIL → D1

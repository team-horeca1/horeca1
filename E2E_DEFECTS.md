# E2E Defect Ledger

## Production run — 2026-07-15 (launch gap pass)

**Target:** `https://freshville.store`  
**Live image:** `ghcr.io/team-horeca1/horeca1:latest` = **`a437b1f`** (manual `deploy.sh` after CI Deploy SSH failed)  
**Health:** `/api/health` + `/api/v1/health` OK  

### Fixture map

| Actor | Identity | Notes |
|-------|----------|-------|
| Admin | `admin@horeca1.com` | Session used + Impersonate |
| Customer | Mandar Shetty — Rasoi Bar & Restaurant — `saketsuman@rediffmail.com` | 3 outlets |
| Vendor | Patel Enterprise — Chirag Patel — `saket@horeca1.com` | 3 outlets |
| Brand | Sarwar — `saket@red.org.in` | Admin View |
| Disposable | E2E Viewer (Mandar BA); Support Agent (deleted during DELETE retest) | |

---

### D5 — CI Deploy failure (root cause)

| | |
|--|--|
| Symptom | Actions `#240` / `#241` — Build & push **OK**, Deploy **fails** on `SSH deploy` |
| Evidence | Droplet `auth.log`: **no** GitHub Actions SSH attempt on 2026-07-15 for those runs (failure before TCP auth). Last good CI key accept: **2026-07-14** fingerprint `SHA256:YBz7Eu690sUgliPAdIhtki+E+NAcb+yyhph2ZZPXy5A` |
| Cause | `secrets.DO_SSH_PRIVATE_KEY` missing/empty/wrong on the repo that runs Actions (`AneeVerse/horeca1` and/or `team-horeca1/horeca1`) |
| Key on droplet | Private key still at `/root/.ssh/github_actions_deploy` (matches `YBz7Eu…` / `github-actions-horeca1`) |
| Fix (human, once) | GitHub → repo Settings → Secrets → Actions → set **`DO_SSH_PRIVATE_KEY`** to full contents of `/root/.ssh/github_actions_deploy` (include `BEGIN/END OPENSSH PRIVATE KEY`). Do this on **both** remotes if both run CI. Then re-run failed Deploy job. |
| Workaround | `ssh root@64.227.187.210 "cd /opt/horeca1 && DEPLOY_SHA=<sha> bash deploy.sh"` (already used for `a437b1f`) |

---

### Production defect ledger

| ID | Actor | Sev | Surface | Observation | Root cause | Fix | Retest |
|----|-------|-----|---------|-------------|------------|-----|--------|
| P1-01 | Admin→Customer | P1 | `/profile/team` | Wrong BA under Admin View | JWT BA | Prefer URL/`/api/v1/account` | **PASS** live |
| P1-02 | Admin→Vendor | P1 | vendor notifications | Admin userId | `ctx.userId` | `resolveVendorNotificationUserId` | **PASS** live |
| P2-01 | Admin→Customer | P2 | storefront banner | Banner only on profile | layout | root layout mount | **PASS** live |
| P2-02 | Ops | P2 | image cache | EACCES `.next/cache` | perms | Dockerfile | **PASS** |
| P2-03 | Customer | P2 | `/lists` | 404 | wrong URL | use `/order-lists` | closed |
| P2-04 | Admin | P2 | bad JSON | 500 | SyntaxError | 400 VALIDATION_ERROR | **PASS** |
| P2-05 | Admin | P2 | team DELETE | membership id 404 | id vs userId | accept both | **PASS** |
| P2-06 | Storefront | P2 | Footer | “Shoping Cart”, “Grocery Shop…supliers”, ©2025 | placeholder copy | Footer.tsx (local, not deployed) | pending ship |
| P2-07 | Storefront | P2 | Homepage catalog | Demo junk: `Catogery-01`, `cat-02`, `Vender01`, brand `gggg` | seed/demo data live | hide/clean via admin | open |
| P2-08 | Admin→Customer | P2 | Profile / Outlets | Brief empty “Hi there” / “Active Branches (0)” then fills | slow client fetch, no skeleton | loading state (optional) | observed |
| P2-09 | Admin→Vendor | P2 | Vendor settings | MOV editable under Admin View with no lock cue | intentional or missing MW lock | decide + affordance | open |
| P2-10 | Brand | P2 | `/brand/register` | No OTP channel toggle (unlike customer register) | different flow for logged-in add-brand | align or document | open |
| P2-11 | Vendor | P2 | Mobile inventory | Transfer/Export/Bulk bar may crowd at 390px | dense action bar | wrap/stack | open |
| D5 | Ops | P2 | CI Deploy | SSH step fails | secret | restore `DO_SSH_PRIVATE_KEY` | open |

---

### Honest gap matrix (launch UI/UX)

| Area | Status | Notes |
|------|--------|-------|
| **Preflight health + image** | PASS | `a437b1f` live via manual deploy |
| **Auth: OTP login UI** | PASS | `/login` Send OTP + password path present |
| **Auth: password login + logout E2E** | PARTIAL | UI present; full logout/login cycle not re-run this pass (admin session held) |
| **Register customer OTP channels** | PASS | Verify via Mobile / Email; email↔mobile optional copy; Send OTP |
| **Browse home/search** | PASS | Search garlic → Patel SKU; homepage loads |
| **Pin / OOS** | PARTIAL | Search returned in-stock; dedicated OOS-hidden pin walk not re-done |
| **Cart ≥3 / oversell / checkout MOV / Razorpay abandon** | PASS | Prior pack + retest |
| **Orders + invoice PDF** | PASS | Prior pack |
| **Lists / wishlist / wallet / rewards** | PASS | Pages 200 + open |
| **Profile + outlets** | PASS* | Mandar details + 3 outlets after load (*empty flash P2-08) |
| **Account team Viewer** | PASS | After P1-01 fix |
| **Vendor warehouse / inventory outletId / pages** | PASS | Prior pack |
| **Vendor pending→confirmed→processing** | PASS | Unpaid PO-2026-701824-01 → processing via UI |
| **Vendor team invite Sales Rep** | PASS | `e2e-sales-202607151046@example.com` left labeled |
| **Vendor settings MOV under Admin View** | PARTIAL | MOV editable (no lock affordance); MW “always on” |
| **Brand portal + Marketing invite** | PASS | Sarwar; `e2e-mkt-202607151050@example.com` Marketing Exec |
| **Brand `/brand/register` OTP channels** | PARTIAL | Logged-in add-brand form; no Mobile/Email OTP toggle |
| **Customer register OTP channels** | PASS | Verify via Mobile / Email |
| **Admin portal + Support Agent + Impersonate** | PASS | Prior + DELETE retest |
| **Admin finance filter / approve disposable** | PARTIAL / not done | |
| **Vendor onboarding submit → 201** | NOT DONE | register opened/abandoned only |
| **Mobile viewport home/cart** | PASS | 390×844 no horizontal overflow |
| **Mobile vendor inventory** | PARTIAL | Action bar may crowd at true 390px |
| **Cross: Admin View cart ownership + notif scope** | PASS | |
| **Bad JSON error surface** | PASS | |

---

### Open launch blockers / must-do before “go”

1. **Restore `DO_SSH_PRIVATE_KEY`** so CI Deploy works (D5) — otherwise every push needs manual SSH.
2. **Ship footer copy fix** (P2-06) + ideally scrub demo catalog names (P2-07).
3. Optional: vendor onboarding submit smoke (disposable) if launch includes new vendors Day 1.
4. Clean or keep labeled disposables: `e2e-sales-…`, `e2e-mkt-…` (and note PO-2026-701824-01 now processing).

### Out of scope

- Live Razorpay success charge  
- WhatsApp  
- Exhaustive report charts  
- Historical `outletId: null` service-area backfill  

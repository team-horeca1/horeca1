# PROMOTIONS MARKETING ENGINE — FINAL QA

**Date:** 2026-08-20  
**Environment:** local Turbopack `http://localhost:3000`  
**Build/commit:** `8329d82` + uncommitted promo QA fixes  
**Browser:** Playwright MCP Edge (headed) + Chromium e2e  
**MCP:** Playwright OK  
**Database:** local Postgres — E2E leftovers deactivated; dynamic configs created then cleaned  

---

## ROLE COVERAGE

| Role | Result |
|------|--------|
| Admin / Super Admin | PASS — create/edit coupons & cashback, programs, UPI coerce, modal UI |
| Vendor A / B | PASS — scoped create; IDOR 404; audience stripped; cashback modal |
| Brand | N/A — brand promo portal not implemented (documented) |
| Customer | PASS — deals, preview, rewards invite, RBAC bounce from portals |
| Team/RBAC | PASS — server-side 403/404 on privileged promo APIs |

---

## CONFIGURATION TEST

`scripts/promo-qa-dynamic-accept.mjs` → **15/15 PASS**

Arbitrary admin-created %/flat/MOV/max coupons + cashbacks; preview math matches config; offers show **Up to**; invite uses request origin. Headed verify: new ₹250 cashback rendered **Up to ₹250 cashback**.

---

## SECURITY

RBAC 403 · Vendor A→B IDOR 404 · Client discount tampering ignored · Payout CSRF 403 · UPI→wallet coerce · Duplicate settle no-op (math) · Welcome/referral idempotent on signup

---

## FINANCIAL

Promo math **92/0** · Preview/config-driven · Settle/cancel/clawback unit-tested · Browser Razorpay pay **BLOCKED** (BLOCK-002)

---

## UI

Deals Up-to ✓ · Invite `:3000` ✓ · Newsletter spacing ✓ · Navbar hydration 0 errors ✓ · Admin/vendor promotions (CartProvider crash fixed) ✓

---

## AUTOMATED REGRESSION

| Suite | Result |
|-------|--------|
| Dynamic accept | 15/15 |
| Promo math | 92/0 |
| e2e `promotions-phase1.spec.ts` | **15/15 PASS** (~3.2m) |
| Flakes fixed | credentialsLogin (request API, no follow `:3001`); signup promo side-effects; admin CartProvider |

---

## BUGS

**P0:** none  
**P1 fixed:** BUG-UI-004 (admin CartProvider), BUG-PROG-001 (signup welcome/referral)  
**P2 fixed:** BUG-UI-001/002, BUG-UX-001, BUG-E2E-001  
**P4 fixed:** BUG-UI-003  
**Open:** BLOCK-002 Razorpay headed pay  

See `docs/promo-qa-exploratory-defect-log.md`.

---

## FIXES APPLIED

1. Navbar hydration — cache only in `useEffect`  
2. Referral invite — request Host / `invitePath` / client origin  
3. Cashback badge — always **Up to** + deals disclaimer  
4. Newsletter spacing  
5. `useOptionalCart` for account switcher (admin/vendor)  
6. Signup — inline welcome + referral attribution (idempotent)  
7. e2e auth — APIRequestContext, `maxRedirects:0`, clearCookies  
8. Harnesses — dynamic accept, deactivate leftovers, seed visible cashback  

---

## REMAINING BLOCKERS

1. Razorpay live pay→settle in browser (settlement covered deterministically)  
2. Keep process `AUTH_URL=http://localhost:3000` aligned with the app port when starting Next  

---

## FINAL ACCEPTANCE

**PASS** (Razorpay headed pay blocked)

Admin can create previously unseen promotion configurations through the app; eligibility, preview, display, RBAC, and wallet destination rules honor those values without code changes.

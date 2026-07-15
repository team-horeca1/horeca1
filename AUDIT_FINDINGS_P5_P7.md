# AUDIT FINDINGS — Packs P5 / P6 / P7

**Target:** `http://localhost:3000`  
**Repo:** `c:\Users\Roger\Desktop\horeca1-prod`  
**Date:** 2026-07-15  
**Auditor role:** Principal Security / API QA  
**Method:** Cookie-jar credential login (Auth.js CSRF + `/api/auth/callback/credentials`), `fetch`/`curl`-equivalent probes via `scripts/audit-p5-p7.mjs` (+ supplement/final). **No application code changes.**

**Accounts used:** seeded admin / customer / vendor / brand + disposable vendor/customer from `AUDIT_SECRETS.local.md`.

---

## Executive summary

RBAC gates on `/api/v1/admin/*` and `/api/v1/vendor/*` held for customer, vendor, brand, and unauthenticated callers. Cross-vendor product mutation IDOR returned **404** (tenant-scoped). Payment/wallet webhooks reject bad/missing HMAC. Session cookies are **HttpOnly + SameSite=Lax** (Secure off on localhost HTTP, expected). Admin impersonation enter/exit works; customer impersonation correctly re-scopes `/api/v1/auth/me` and notifications.

**Open findings:** 3 (1 Medium, 2 Low). **No Critical / High** confirmed in this pass.

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High     | 0 |
| Medium   | 1 |
| Low      | 2 |

---

## Findings

### API-001 — Unauthenticated onboarding document upload returns 500 on non-multipart body

| Field | Value |
|-------|--------|
| **ID** | API-001 |
| **Severity** | Medium |
| **Pack** | P7 / P6 |
| **Endpoint** | `POST /api/v1/vendor/onboarding/documents` |
| **Evidence** | `Content-Type: application/json` + `{}` → **500** `{ code: "INTERNAL_ERROR", message: "Content-Type was not one of \"multipart/form-data\" or \"application/x-www-form-urlencoded\"." }` |
| **Expected** | **400/415** validation (or auth-style 403) before treating as internal error |
| **Retest (multipart, no OTP)** | **403** `Phone not verified` — OTP gate works when body is valid multipart |
| **Risk** | Error-handling hygiene / possible info leak of framework message; not a bypass (OTP still required for success) |
| **Status** | Open |

### SEC-001 — Impersonation *name* cookies are readable by JS (`HttpOnly=false`)

| Field | Value |
|-------|--------|
| **ID** | SEC-001 |
| **Severity** | Low |
| **Pack** | P5 / P7 |
| **Evidence** | On `POST /api/v1/admin/impersonate`, Set-Cookie includes `admin_impersonate_vendor_name` with **HttpOnly=false**, SameSite=Lax, Secure=false (localhost). Vendor **id** + **outlet** cookies are HttpOnly=true. |
| **Note** | Likely intentional for UI badge text. XSS could read display name only, not the impersonation id token. |
| **Risk** | Minor info disclosure under XSS; not privilege escalation by itself |
| **Status** | Open (design acknowledgment acceptable) |

### SEC-002 — SVG allowed on authenticated image upload (stored XSS surface if served inline)

| Field | Value |
|-------|--------|
| **ID** | SEC-002 |
| **Severity** | Low |
| **Pack** | P7 |
| **Endpoint** | `POST /api/v1/upload` (`ALLOWED_TYPES` includes `image/svg+xml`) |
| **Evidence** | Unauthenticated SVG multipart → **401** (auth required — good). Authenticated path still permits SVG MIME. |
| **Risk** | If ImageKit/CDN serves SVG with `Content-Type: image/svg+xml` and app embeds via `<img>`/object without sanitization, scriptable SVG is a stored-XSS class risk for authenticated uploaders |
| **Status** | Open (defense-in-depth; confirm CDN Content-Disposition / CSP in prod) |

---

## PASS list

### P5 — RBAC / IDOR

| ID | Result | Detail |
|----|--------|--------|
| RBAC-001 | PASS | Customer `GET/POST /api/v1/vendor/*` (dashboard, orders, products, settings) → **403** |
| RBAC-002 | PASS | Customer `GET/POST /api/v1/admin/*` (dashboard, users, orders, vendors, impersonate) → **403** |
| RBAC-003 | PASS | Vendor `GET/POST /api/v1/admin/*` (dashboard, users, orders, vendors, finance, audit-logs, impersonate) → **403** |
| RBAC-004 | PASS | Brand `GET /api/v1/admin/users` → **403**; `GET /api/v1/vendor/dashboard` → **403** |
| RBAC-005 | PASS | Unauthenticated: admin users/dashboard, vendor dashboard/orders, orders, cart GET/POST, notifications, upload, vendor documents upload → **401** |
| RBAC-006 | PASS | IDOR: Vendor A (`Daily Fresh`, `0068e28b-…`) `PATCH/DELETE` Green Valley product (`85f39d83-…`) → **404** `Product not found` |
| RBAC-007 | PASS | IDOR: Disposable Vendor B `PATCH` Green Valley product → **404** |
| RBAC-008 | PASS | `?vendorId=` query on `/api/v1/vendor/settings` does not switch tenant to Vendor B |
| RBAC-009 | PASS | Forged `admin_impersonate_vendor_id` cookie as non-admin vendor ignored (settings stay own vendor) |
| RBAC-010 | PASS | Admin vendor impersonation: `POST` enter **200**, `GET` state **200**, vendor dashboard **200**, `DELETE` exit **200** |
| RBAC-011 | PASS | Admin customer impersonation: enter **200**; `/api/v1/auth/me` returns disposable customer profile + `impersonating` block; notifications list scoped (empty inbox for that user); exit **200** |
| RBAC-012 | PASS | Under **vendor** Admin View, `/api/v1/auth/me` remains admin JWT user (cookie-based vendor context separate) — consistent with design |

### P6 — API matrix

| ID | Result | Detail |
|----|--------|--------|
| API-H01 | PASS | `GET /api/health` → **200** `{ status: "healthy", db.connected: true }` |
| API-A01 | PASS | `GET /api/auth/csrf` → **200** + `csrfToken` |
| API-A02 | PASS | Credentials login (admin, customer, vendor, vendorB, brand) → session cookies issued |
| API-A03 | PASS | `GET /api/v1/auth/me` authenticated → **200** for admin/customer/vendor/brand |
| API-A04 | PASS | `GET /api/v1/auth/me` unauth → **401** |
| API-A05 | PASS | Logout then `/api/v1/auth/me` → **401** |
| API-C01 | PASS | Cart GET/POST unauth → **401** |
| API-C02 | PASS | Cart GET as customer → **200** (vendor-grouped cart) |
| API-C03 | PASS | Cart POST missing `productId`/`vendorId` → **400** `VALIDATION_ERROR` with field details |
| API-O01 | PASS | Orders list as customer → **200** |
| API-O02 | PASS | Orders list unauth → **401** |
| API-O03 | PASS | Domain: checkout with cart total ₹90 vs MOV ₹400 → **400** `BELOW_MOV` + `min_order_value` / `current_total` |
| API-O04 | PASS | Empty/invalid order body → **400** `VALIDATION_ERROR` (Zod field paths) |
| API-P01 | PASS | `POST /api/v1/payments/webhook` invalid HMAC → **400** `{ received: false, error: "Invalid signature" }` |
| API-P02 | PASS | Payments webhook missing signature → **400** same rejection |
| API-P03 | PASS | `POST /api/v1/wallet/razorpay-webhook` bad signature → **400** `Invalid signature` |
| API-V01 | PASS | Invalid JSON body (`{not-json`) on cart / admin impersonate → **400** `{ code: "VALIDATION_ERROR", message: "Invalid JSON body" }` |
| API-OTP1 | PASS | OTP send probe ×2 (phone `9000000099`) → **200**; no lockout from 2 probes |
| API-OTP2 | PASS (obs) | Soft cap is **3 / 10 min** in code (`recentCount >= 3` → 429); second probe not 429 is expected |

### P7 — Security

| ID | Result | Detail |
|----|--------|--------|
| SEC-C01 | PASS | Session cookie (`authjs.session-token` / chunked `.0`) **HttpOnly=true**, **SameSite=Lax**, **Secure=false** on localhost HTTP (expected; prod should set Secure via `NODE_ENV=production`) |
| SEC-X01 | PASS | `GET /search?q=<script>alert(1)</script>` — raw script tag **not** reflected in HTML response body |
| SEC-X02 | PASS | `GET /api/v1/search?q=…` XSS payload — no raw script echo in JSON results (empty result set) |
| SEC-Q01 | PASS | SQL-ish `q='; DROP TABLE products;--` on search API → **200**, no 5xx |
| SEC-A01 | PASS | `GET /admin/dashboard` unauth → **307** `Location: /login?redirect=%2Fadmin%2Fdashboard` |
| SEC-A02 | PASS | `GET /api/v1/admin/users` unauth → **401** |
| SEC-S01 | PASS | `.env.example`: `NEXT_PUBLIC_*` limited to Sentry DSN, Google Maps key, register-email flag — no private Razorpay/ImageKit/Auth secrets as public |
| SEC-S02 | PASS | Homepage HTML spot-check: no matches for `AUTH_SECRET`, private keys, `postgres://…`, live Razorpay/`sk_live`/`re_` secrets |
| SEC-U01 | PASS | `POST /api/v1/upload` unauth → **401** |
| SEC-U02 | PASS | `POST /api/v1/vendor/documents/upload` unauth → **401** |
| SEC-U03 | PASS | Onboarding docs multipart without verified OTP → **403** `Phone not verified` |

---

## Not fully exercised / gaps

| Gap | Reason |
|-----|--------|
| Customer↔customer order IDOR | No customer orders in DB for cross-user GET/invoice |
| Vendor↔vendor order IDOR | Admin orders list empty in this environment |
| Production `Secure` cookie flag | Only localhost HTTP audited |
| Deep OTP brute / lockout | Intentionally limited to 2 sends |
| Playwright UI XSS DOM sinks | API/HTML response check only |
| Full brand portal IDOR matrix | Brand→admin/vendor denied; brand-scoped resource IDOR not expanded |

---

## Probe artifacts

| File | Purpose |
|------|---------|
| `scripts/audit-p5-p7.mjs` | Primary P5–P7 runner |
| `scripts/audit-p5-p7-results.json` | Primary results (81 passes, 2 provisional notes refined above) |
| `scripts/audit-p5-p7-supplement.mjs` / `-supplement.json` | IDOR + impersonation + onboarding multipart |
| `scripts/audit-p5-p7-final.mjs` / `-final.json` | BELOW_MOV, wallet webhook, brand RBAC, cookie flags |

---

## Recommended follow-ups (no fixes applied)

1. Map `formData()` Content-Type errors on onboarding upload to **400/415** (API-001).
2. Confirm prod Auth.js + impersonation cookies set **Secure** and clearing uses matching attributes (`clearAllImpersonationCookies`).
3. Revisit allowing `image/svg+xml` on `/api/v1/upload` or force non-executable delivery (SEC-002).
4. When seed data has multi-vendor orders, re-run customer/vendor order IDOR matrix.

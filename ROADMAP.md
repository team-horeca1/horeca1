# Horeca1 — Production Roadmap
_Last updated: 2026-04-22. What's left before true v1 launch, grouped by priority._

---

## SHIPPED (for context)

| Phase | Scope | Commit |
|-------|-------|--------|
| 1 | UX wiring — 3 bulk slabs, per-PO checkout, approvals Edit, vendor order-list shortcut, MOV enforcement | `60a1b7f` |
| 2 | Schema + UX — multi-category, delivery-slot picker, MOV, OOS alternates, pincode gate | `35b56cb` |
| 3 | Notifications — BullMQ worker, email + SMS providers, event bus, `/api/v1/health` | `c1d1c92` |
| 4.2 | "Complete your profile" nudge | `3fc88bb` |
| 4.4 | Homepage + search polish, real deals feed, honest vendor cards | `27080f5` |
| 5.1 | Module extraction — services under `src/modules/` already in place | pre-existing |
| 5.2 | Event bus seam — `src/events/emitter.ts` | `c1d1c92` |
| 5.3 | Multi-tenancy enforcement — `resolveVendorContext`/`resolveBrandContext` | pre-existing |
| 5.4 | Redis-backed rate limiter — ZSET sliding window + circuit breaker | `bb64e96` |
| 5.5 | Audit log — `AuditLog` model, fire-and-forget `logAction`, admin routes wired | `bb64e96` |
| — | Lint sweep — 0 errors, typed everything, deferred setState | `39f407c` |
| P0.1 | Razorpay webhook — `POST /api/v1/payments/webhook`, HMAC-verified, handles `payment.captured` / `payment.failed` | `14e7771` |
| P1.6 | Search — `pg_trgm` fuzzy match (typo tolerance) + raw SQL fixed for lowercase table name | `5586a0d` |
| P1.7 | Vendor onboarding documents — `VendorDocument` model, vendor settings upload UI, admin vendor detail verification UI + API | `14e7771` + `d34cb93` |
| P1.8 | Refunds & returns — `ReturnRequest` model, customer "Request Return" UI on order page, admin Returns page with approve/reject/refund flow | `14e7771` + `d34cb93` |
| P1.9 | Invoice PDF — GST-compliant PDF via pdfkit, `GET /api/v1/orders/[id]/invoice`, Download button on order detail | `14e7771` |
| P1.11 | Brand dropdown — vendor product create/edit uses `<datalist>` populated from `/api/v1/brands` | `14e7771` |
| P1.12 | Image optimization — 22 `<img>` → Next.js `<Image>` across Hero, Navbar, TopVendors, RecommendedCategories, checkout, category, vendor portal | `14e7771` + `d34cb93` |
| P0.2 | WhatsApp MSG91 — code fully wired (`sms.ts` hits correct endpoint, `MSG91_WHATSAPP_NUMBER` env var added); waiting on Meta/MSG91 business approval to go live | `85f3faf` |
| P0.3 | Database backups — `/opt/horeca1/backup.sh` on droplet, tested (44KB compressed dump), 7-day retention, cron ready to enable when needed | manual |
| P1.11 | Sentry — DSN confirmed live in `.env.production` on droplet; errors reach Sentry dashboard | pre-existing |
| — | Notification worker — now runs as `horeca1-worker` Docker container alongside app; Resend API key live in prod | `e244774` |
| — | Email (Resend) — API key added to prod + local; emails will deliver after this deploy | `e244774` |

Deployed on DO Droplet `64.227.187.210`. 16 migrations applied. Zero TS errors.

---

## 🔴 P0 — Must ship before public launch

### 2. WhatsApp notification channel (waiting on approval)
**Code is complete.** MSG91 WhatsApp endpoint is wired, `MSG91_WHATSAPP_NUMBER` + `MSG91_WHATSAPP_TEMPLATE_ID` env vars are all that's needed.
**Blocked by:** MSG91/Meta WhatsApp Business approval (external process, not code work).
**When approved:** Add `MSG91_WHATSAPP_NUMBER=91XXXXXXXXXX` and `MSG91_WHATSAPP_TEMPLATE_ID=xxx` to `/opt/horeca1/.env.production` → restart worker → done.

### 4. SSL / HTTPS certificate
**What's there:** Nginx on port 80 (HTTP only).
**What's missing:** Let's Encrypt cert + HTTPS redirect + HSTS header.
**Why critical:** Razorpay, cookies with `secure: true`, SEO — all require HTTPS. Needs a real domain pointing at the droplet.
**Effort:** 2 hours (once domain DNS points at droplet).
**Fix:** `certbot --nginx` + redirect in `docker/nginx/nginx.conf`.

### 5. Order confirmation + email receipt end-to-end test
**What exists:** event bus emits `order.created`, worker consumes it, email provider sends.
**What's missing:** Nobody has verified the full chain in prod. Need a smoke test: place an order → customer gets email → vendor gets email → `Notification.status` flips to `sent`.
**Effort:** 30 min of manual testing.

---

## 🟠 P1 — Should ship in next 2 weeks

### 10. Push notifications (in-browser + FCM)
**What's there:** `Notification.channel: 'push'` is stubbed.
**Gap:** No service worker, no subscription flow, no FCM server key.
**Fix:** `next-pwa` service worker + Web Push API + FCM for mobile browsers.
**Effort:** 3 days.

### 11. Sentry — verified wiring
**What's there:** `@sentry/nextjs` installed, config files present, env vars in `.env.example`.
**Gap:** Nobody has confirmed errors actually reach Sentry in prod. `/sentry-example-page` exists for a test.
**Fix:** Set `SENTRY_DSN` on droplet, trigger the test page, verify dashboard receives.
**Effort:** 30 min.

---

## 🟡 P2 — Nice-to-have / strategic

### 13. CI/CD pipeline
**Missing:** `.github/workflows/` has nothing. Deploy is a manual SSH + bash script.
**Fix:** GitHub Actions — on push to master, run `tsc + lint + build`, then SSH to droplet and run the deploy script. Add a staging environment.
**Effort:** 1 day.

### 14. Test suite
**Missing:** No unit tests, no integration tests, no E2E. CLAUDE.md literally says "No test suite is configured."
**Fix:** Playwright for critical flows (signup, add to cart, checkout, place order), Vitest for services (payment.verify, rateLimit, auditLog).
**Effort:** 1 week for MVP coverage.

### 15. i18n (Phase 4.3 — deliberately skipped)
**Missing:** `next-intl` install + Hindi + Marathi locales.
**Fix:** Mumbai-first — start with `en` + `hi`. Persist `User.locale`.
**Effort:** 3 days.

### 16. Analytics
**Missing:** No event tracking — what do users search, where do they drop off, which products convert?
**Fix options:** PostHog (self-hosted), Umami, or GA4. PostHog is the most versatile for a B2B SaaS.
**Effort:** 1 day.

### 17. Credit onboarding / KYC
**What's there:** `CreditAccount` model, `/api/v1/credit/signup` endpoint.
**Gap:** No UI flow for customer to apply for credit, no underwriting logic, no limit-approval workflow.
**Effort:** 1 week.

### 18. Vendor dashboard — reports
**What's there:** Orders + inventory views.
**Gap:** No "monthly revenue", "top products", "lost sales from OOS" reports.
**Effort:** 3 days.

### 19. Admin — bulk operations
**What's there:** CSV import for products/categories exists.
**Gap:** No bulk vendor approval, no bulk price update, no bulk category reassignment.
**Effort:** 2 days.

### 20. Background image optimization
**Gap:** ImageKit is wired but no automatic resize/format conversion on upload — raw uploads served as-is.
**Fix:** Server-side transform URLs via ImageKit's URL API on `src/lib/providers/imagekit.ts`.
**Effort:** 1 day.

---

## 🔵 P3 — Long-term platform work

- **Mobile apps** (React Native or Capacitor wrapping the web)
- **Vendor self-serve onboarding** (currently admin-approved manually)
- **Inventory sync** with external systems (Tally, Zoho Inventory)
- **Delivery partner integration** (Dunzo, Porter, WeFast)
- **Multi-region** — currently Mumbai-first. Data model supports pincode scoping, but routing/CDN/latency tuning not done.
- **Seller advertising** — promoted placements on homepage/category pages
- **Reviews moderation** workflow for admin
- **Loyalty program** / rewards

---

## 🧹 Technical debt

| Debt | Severity | Fix cost |
|------|----------|----------|
| ~246 remaining lint warnings (`<img>` in admin/brand portal, unused vars) | Low | 1 day |
| No test suite | High | 1 week MVP |
| No CI/CD | Medium | 1 day |
| `ecosystem.config.js` (PM2) present but Docker is the deploy target — one is dead code | Low | 1 hour |
| `_ctx` params littered across API routes | Trivial | — |

---

## 📊 Suggested sequencing

**Now (1–2 days):** Email smoke test (P0.5) — place a test order, verify email arrives.
**When domain arrives:** SSL/HTTPS + Resend domain verify → full email deliverability to all users.
**When MSG91 approves WhatsApp:** Add 2 env vars to prod → WhatsApp live instantly.
**Week 1:** P2.13 (CI/CD) + P2.16 (Analytics — PostHog).
**Month 2+:** Tests, i18n, credit flow, push notifications.

The only true blocker left before public launch is **SSL + domain**. Everything else is either done or waiting on external approvals.

---

## 🎯 Launch-readiness checklist

Before flipping DNS to the droplet and announcing publicly:

- [ ] HTTPS + real domain + HSTS
- [x] Razorpay webhook live + tested with a real payment
- [ ] Daily Postgres backups enabled (script ready, cron needs uncommenting + S3 for off-droplet copy)
- [x] Sentry receiving errors from prod (DSN live in .env.production)
- [ ] Email deliverability tested — smoke test needed; SPF/DKIM requires verified domain in Resend
- [ ] MSG91 SMS DLT templates approved (Indian regulation)
- [ ] Terms of Service + Privacy Policy pages published
- [ ] Legal entity + GST registration referenced in footer/invoice
- [ ] One full order placed end-to-end: signup → cart → slot → pay → confirm → notify → vendor ship → delivered → review
- [ ] At least 10 real vendors onboarded with products, so the site doesn't look empty
- [ ] Admin team trained to handle approvals + support

Everything above is **doable in ~2 weeks of focused work** before a public launch.

---

## 🔍 2026-04-29 Full Audit — pending items

Findings from a 3-agent code audit on the deployed `64.227.187.210` build. Each item links to file:line evidence. Tick the box when fixed; agent re-audit will catch regressions.

### 🚨 BLOCKERS — money loss / data corruption / broken core

- [x] **B1.** Returns refund never calls Razorpay — ✅ fixed in commit `6780ba3`. Admin "Refund" now calls `razorpay.payments.refund()` with paise, stores the refund id, flips `Order.paymentStatus='refunded'` + `Payment.status='refunded'` atomically, audit-logged.
- [x] **B2.** Order cancellation doesn't release inventory — ✅ fixed in commit `6780ba3`. `releaseStock()` runs in the same transaction; `OrderConfirmed/Shipped/Delivered/Cancelled` events now emitted on every admin status transition so the customer gets notified.
- [x] **B3.** Webhook amount not verified — ✅ fixed in commit `6780ba3`. `payment.captured` rejects if `entity.amount` (paise) ≠ stored `payment.amount × 100`. `refund.processed` rejects amounts ≤0 or > original payment.

### 🔴 STUBBED FEATURES — UI present, key flow missing

- [x] **S1.** Brand storefronts — ✅ fixed in commit `3418571`. Removed the 200-line `BRAND_DATA` mock; component always fetches `/api/v1/brands/[id]` now.
- [ ] **S2.** Credit payment is cosmetic — order created with `paymentMethod='credit'` but `creditUsed` never debited. [src/modules/order/order.service.ts](src/modules/order/order.service.ts)
- [ ] **S3.** Wallet system has schema only — no UI, no top-up, no admin credit. Either build it or remove the model.
- [ ] **S4.** Credit signup API works but no customer-facing apply form, no admin underwriting page.
- [ ] **S5.** Admin dashboard charts are hardcoded arrays (`DATA_30D`, `SALES_COMPARISON_DATA`) — no Prisma aggregation. Vendor reports are real, only admin's are fake. [src/app/admin/reports/page.tsx:39](src/app/admin/reports/page.tsx#L39)
- [ ] **S6.** Push notifications half-wired — service worker, VAPID keys, subscribe button all present, but `sendPushToUser()` has no callers anywhere.
- [ ] **S7.** Vendor follow/favorite button on store header has no `onClick`. [src/components/features/vendor/VendorStoreHeader.tsx:229](src/components/features/vendor/VendorStoreHeader.tsx#L229)
- [ ] **S8.** Recently-viewed page exists but no code calls `trackProductView()` — page always empty.
- [ ] **S9.** Collections — homepage carousel renders, no admin CRUD page. Schema + API exist.

### 🟠 MAJOR BUGS — security / scaling / data integrity

- [x] **M1.** OTP rate-limit TOCTOU race — ✅ fixed in commit `3418571`. Count + invalidate + create now run inside `$transaction({ isolationLevel: 'Serializable' })`; conflicting concurrent sends abort with a 429.
- [x] **M2.** Cutoff-time check uses Node's local timezone — ✅ fixed in commit `3418571`. Day + HH:mm now derived via `Intl.DateTimeFormat({ timeZone: 'Asia/Kolkata' })` and compared as minutes-since-midnight.
- [x] **M3.** N+1 in `inventory.bulkCheck` — ✅ fixed in commit `6cf5a7c`. Single `findMany({ in: ids })` + Map lookup.
- [x] **M4.** Admin order status-change skips events — ✅ fixed in commit `6780ba3` alongside B2. Status transitions now emit `OrderConfirmed/Shipped/Delivered/Cancelled` events.
- [x] **M5.** Cart guest→login merge missing — ✅ fixed in commit `6cf5a7c`. New `POST /api/v1/cart/merge` + CartContext sends localStorage items before fetching the server cart.
- [x] **M6.** Hard-delete user cascades and destroys audit trail — ✅ fixed in commit `3418571`. DELETE handler now sets `isActive=false`; vendors/orders/audit links preserved.
- [ ] **M7.** Email enumeration via `code: 'NO_ACCOUNT'` response — return generic message. [src/app/api/v1/auth/otp/send/route.ts:91](src/app/api/v1/auth/otp/send/route.ts#L91)
- [x] **M8.** No webhook idempotency table — ✅ fixed in commit `6cf5a7c`. New `WebhookEvent` model + migration; Razorpay handler dedups by `${event}:${entityId}`.
- [ ] **M9.** Refund webhook can refund any payment (same shape bug as B3 but for `payment.refunded` event).
- [ ] **M10.** No vendor settlement / payout model — needed before paying vendors. Add `Settlement` model.
- [x] **M11.** Most API routes have no rate limiting — ✅ partial fix in commit `6cf5a7c`. New `withRateLimit()` helper with presets (auth/mutation/upload/webhook). Applied to OTP send, file upload, Razorpay webhook, admin user create. More routes can opt in with one line.
- [ ] **M12.** Audit log spotty — only 4 actions logged. Add for user delete, brand approve, category approve, price edits, refunds.

### 🟡 POLISH — small fixes, no rush

- [ ] **P1.** GST per-item rounding can drift 1 paisa over big carts → round only the final subtotal.
- [ ] **P2.** `ListOrdered` event in EventMap but never emitted — dead declaration.
- [ ] **P3.** WhatsApp channel in worker has no env-var sanity check at startup.
- [ ] **P4.** Upload route trusts filename extension — derive from MIME type instead.
- [ ] **P5.** `AUTH_SECRET` length not validated (no min ≥32 chars check).
- [ ] **P6.** No scheduled jobs: cancel-unpaid-orders (24h), expire-OTP-cleanup, abandoned-cart-reminder.
- [ ] **P7.** `ecosystem.config.js` (PM2) is dead code — Docker is the deploy target.
- [ ] **P8.** ~246 lint warnings (mostly `<img>` in admin/brand portal).

### ✅ Verified working (good — these were on the worry list)

- Quick Order Lists — full CRUD + reorder
- Customer reviews + vendor rating recompute
- Vendor reports page — real data, real charts (better than ROADMAP.md claimed)
- Profile completeness banner — real flag toggle
- Product `tags` indexed in search (exact-match)

### Vendor Pricing Workspace — Phase 2 (deferred)

- **Show both** ex-GST and inc-GST preview in grid cells (today: ex-GST only; GST at checkout).
- **Per-list GST flag** on `PriceList` for mixed tax treatment (schema + resolver).
- **Maker-checker**: second approver on publish when guardrails warn or change count exceeds threshold.
- **Scheduled publish** queue (draft → publish at `validFrom`).
- **Assignment matrix**: outlet + brand rows, bulk assign CSV, effective-list simulation before save.

### 📅 ROADMAP claims to correct

| Old claim | Reality after audit |
|---|---|
| ✅ Vendor reports = P2 / 3 days | Already shipped + working |
| ✅ Refunds & returns "live" | Customer + admin UI ✓, **money movement ✗ (B1)** |
| ✅ Razorpay webhook live + tested | Live but **amount not verified (B3)** |
| ✅ Email (Resend) live | Code live, **Resend in sandbox** — only sends to `team.horeca1@gmail.com` until domain verified |


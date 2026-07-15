# HoReCa Hub — Architecture Audit Map

**Purpose:** Security / QA audit reference. Describes how the system is structured, where trust boundaries sit, and which surfaces are live vs stale.  
**Scope:** Application architecture as of the working tree at `c:\Users\Roger\Desktop\horeca1-prod`.  
**Constraint:** This file is documentation only; it does not change application source.

**Public product surface:** `https://freshville.store` (Nginx terminates TLS; bare IP `64.227.187.210` redirects to the apex host).

---

## 1. Stack & deploy

### Runtime stack

| Layer | Choice | Primary paths |
|-------|--------|----------------|
| App framework | **Next.js 16.1.6** App Router, React 19, TypeScript strict, Tailwind 4, React Compiler | `package.json`, `next.config.ts`, `src/app/` |
| ORM / DB | **Prisma 7** + `@prisma/adapter-pg` → **PostgreSQL** (compose image `postgres:17-alpine`) | `prisma/schema.prisma`, `src/lib/prisma.ts`, `docker/docker-compose.prod.yml` |
| Cache / jobs | **Redis 7** (`ioredis`) + **BullMQ** | `src/lib/redis.ts`, `src/queues/setup.ts`, `src/workers/` |
| Auth | **Auth.js v5** (`next-auth@5` beta) JWT sessions, Prisma adapter | `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` |
| Payments | **Razorpay** SDK | `src/lib/razorpay.ts`, `src/modules/payment/` |
| Media | **ImageKit** | `src/lib/imagekit.ts` |
| Email | **Resend** (HTTPS) with Nodemailer SMTP fallback | `src/lib/providers/email.ts` |
| SMS / WhatsApp transport | **MSG91** | `src/lib/providers/sms.ts`, `src/lib/providers/whatsapp.ts` |
| Push | `web-push` | `src/lib/providers/push.ts` |
| Monitoring | **Sentry** (`@sentry/nextjs`) | `next.config.ts` (`withSentryConfig`), `src/instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` |
| Maps | Google Maps JS + Places | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, hooks under `src/hooks/` |

Schema scale (approx.): **~90 Prisma models**, **~29 migrations** under `prisma/migrations/`.

### Process topology (production)

```
Internet → Nginx (80/443) → Next.js app container :3000
                ↓
         PostgreSQL + Redis (loopback-published only)
                ↓
         Worker container: notification.worker.ts (BullMQ)
```

- Compose file: `docker/docker-compose.prod.yml`
  - `app` — image `ghcr.io/team-horeca1/horeca1:latest`, standalone Next (`output: 'standalone'`), port 3000, volume `uploads` for KYC docs
  - `worker` — image `ghcr.io/team-horeca1/horeca1-worker:latest`, Dockerfile target `worker`, CMD `npx tsx src/workers/notification.worker.ts`
  - `postgres` — `127.0.0.1:5432` only
  - `redis` — `127.0.0.1:6379` only
  - `nginx` + optional `certbot`
- Image build: `docker/Dockerfile` (multi-stage: `deps` → `builder` → `runner` / `worker`)
- Reverse proxy: `docker/nginx.conf` — HTTP→HTTPS redirect to `freshville.store`, large proxy buffers for Auth.js JWT cookies, `client_max_body_size 25m`
- Security headers (app): `next.config.ts` → `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy

### Secondary / legacy process notes

- `ecosystem.config.js` — PM2 cluster for Next + notification worker. **Docker Compose is the primary prod path**; PM2 is retained as an alternate/historical layout.
- Reconciliation is **not** a long-running Docker service by default: `npm run worker:reconciliation` runs `src/workers/reconciliation.worker.ts` (intended as cron on the droplet).
- Dev tunnel to prod DB/Redis: `npm run tunnel` in `package.json`.

### Env contract

Documented in `.env.example`. Hard fail-fast on import for `DATABASE_URL` + `AUTH_SECRET` via `src/lib/env.ts` (loaded from `src/instrumentation.ts`). Payment/ImageKit clients are **lazy** and throw only when used (`src/lib/razorpay.ts`, `src/lib/imagekit.ts`).

---

## 2. Auth & tenancy

### Identity model

| Concept | Meaning | Schema / code |
|---------|---------|----------------|
| **User (HCID)** | Login identity (`User.id`); display HCID via `hcidDisplay` | `prisma/schema.prisma` `User` |
| **Role (legacy enum)** | `customer \| vendor \| admin \| brand` on `User.role` | `enum Role` |
| **BusinessAccount** | V2.2 tenancy root; flags `isCustomer` / `isVendor` / `isBrand` | `BusinessAccount` |
| **BusinessAccountMember** | User ↔ account membership (replaces LinkedAccount for switching) | `BusinessAccountMember` |
| **Outlet** | Physical location under a BA; owns address; primary outlet on BA | `Outlet` |
| **Vendor / Brand** | 1:1 extensions of BA (`businessAccountId` unique) | `Vendor`, `Brand` |
| **Team roles** | `owner \| manager \| editor \| viewer` on vendor/brand/admin team tables | `enum TeamRole` |
| **Permissions** | Fine-grained `(module, action)` keys in JWT | `src/lib/permissions/registry.ts`, `engine.ts` |

`LinkedAccount` still exists in the schema for historical multi-profile linking; the password credentials provider comment in `src/auth.ts` states V2.2 removed the LinkedAccount `switchToken` login branch in favor of `POST /api/v1/auth/switch-business-account` + `session.update`.

### Auth.js configuration (`src/auth.ts`)

- **Session:** JWT strategy, `maxAge` 7 days, `updateAge` 60s (permissions refresh without full logout).
- **Providers:**
  1. `otp` — phone or email OTP (`OtpCode` table); registration can create User + BA/outlet/KYC fields.
  2. `credentials` — phone-or-email + bcrypt password.
- **JWT payload** (via `loadActiveContext` in `src/lib/activeContext.ts`): `activeBusinessAccountId`, `activeBusinessAccountType`, `activeOutletId`, `accessibleOutletIds`, `permissions`, `isPermissionOwner`, `activeVendorId` / `activeBrandId`, team roles, `availableAccounts`, etc. Types: `src/types/next-auth.d.ts`.
- **Session revoke / ghost JWT:** `getAuthContext` rejects inactive users and Redis/DB revoke flags (`src/middleware/auth.ts`, `src/lib/sessionStale.ts`).

Auth HTTP entry: `src/app/api/auth/[...nextauth]/route.ts` — rate-limits sign-in/session; **signout + CSRF unlimited** (logout must not 429).

Account switching APIs:

- `src/app/api/v1/auth/switch-business-account/route.ts`
- `src/app/api/v1/auth/switch-outlet/route.ts`
- `src/app/api/v1/auth/me/route.ts`

### Multi-tenancy resolution (API)

| Helper | File | Behavior |
|--------|------|----------|
| `resolveVendorContext` / `resolveVendorId` | `src/lib/resolveVendorId.ts` | Admin: own vendor on active BA **or** cookie `admin_impersonate_vendor_id`. Else JWT `activeVendorId`, else own Vendor row scoped to active BA, else `VendorTeamMember`. |
| `resolveBrandContext` / `resolveBrandId` | `src/lib/resolveBrandId.ts` | Same pattern with `admin_impersonate_brand_id`. |
| `resolveBusinessAccountContext` | `src/lib/resolveBusinessAccountContext.ts` | V2.2 BA + outlet + legacy vendor/brand ids; admin impersonation cookies remap BA. |
| `resolveVendorOutletContext` | `src/lib/resolveVendorOutletContext.ts` | Vendor + warehouse/outlet scope (multi-warehouse aware). |
| `effectiveCustomerUserId` | `src/lib/resolveCustomerImpersonation.ts` | Storefront/account reads under customer Admin View. |

**RBAC wrappers** (`src/middleware/rbac.ts`):

- `withRole` / `adminOnly` / `vendorOnly` / `brandOnly` / `customerOnly` — honor **legacy `User.role` OR active BA type flags** (so a vendor owner shopping as customer is not blocked).
- `requireStorefrontAccess` — buying actions; admins unrestricted; customer role or customer BA unrestricted; else permission key required.
- Permission checks: `requirePermission` from `src/lib/permissions/engine.ts`.

### Impersonation (admin)

Cookie names centralized in `src/lib/adminImpersonationCookies.ts` + customer cookies in `src/lib/resolveCustomerImpersonation.ts`:

| Cookie | Purpose |
|--------|---------|
| `admin_impersonate_vendor_id` (+ name, outlet) | Vendor Admin View |
| `admin_impersonate_brand_id` (+ name) | Brand portal Admin View |
| `admin_impersonate_customer_user_id` (+ BA id, name) | Customer storefront Admin View |

API:

- `src/app/api/v1/admin/impersonate/route.ts` — vendor start/exit/outlet switch (permission `vendors.edit`)
- `src/app/api/v1/admin/impersonate/brand/route.ts`
- `src/app/api/v1/admin/impersonate/customer/route.ts`

Cookies: httpOnly for IDs (where applicable), `sameSite: 'lax'`, `secure` in production, ~4h maxAge on vendor flow. `clearAllImpersonationCookies` clears all flavors on mutual exclusion / logout paths.

UI banners/hooks: `src/components/features/admin/AdminCustomerImpersonationBanner.tsx`, `src/hooks/useAdminImpersonate.ts`, `src/lib/clearImpersonation.ts`.

---

## 3. Edge / proxy gating & API middleware

### Edge proxy (`src/proxy.ts`)

Next.js 16 uses **`proxy`** (no root `middleware.ts` in this repo). Exported `proxy(req)` + `config.matcher` exclude `api`, `monitoring`, static assets.

**Page gates (JWT via `getToken` + `AUTH_SECRET`):**

| Surface | Rule |
|---------|------|
| `/admin/*` | Must be authenticated; `role === 'admin'` else redirect `/` |
| `/brand/portal/*` | Auth; `role === 'brand'` **or** admin **or** `activeBusinessAccountType.isBrand` |
| `/vendor/{segment}` where segment ∈ portal set | Auth; vendor/admin or `isVendor` BA type. Public: `/vendor/register` |
| Customer prefixes `/checkout`, `/orders`, `/order-lists`, `/profile`, `/account` | Auth required; redirect `/login?redirect=…` |

**Not gated at edge:** marketplace pages (home, product, vendors, cart listing, search, login/register), and **all `/api/*`** (API auth is handler-level).

Vendor portal segments include: dashboard, orders, products, inventory, warehouse, returns, claims, brand-mappings, price-lists, promotions, customers, sales-team, credit, wallet, ledger, reports, notifications, account, team, outlets, settings, collections, customer-groups, setup.

### API middleware (Node route wrappers)

Located under `src/middleware/` (imported by route handlers; **not** Next edge middleware):

| Module | Role |
|--------|------|
| `auth.ts` | `getAuthContext`, `withAuth` — session + active/revoke checks; attaches `AuthContext` including `impersonatedCustomer` for admins |
| `rbac.ts` | `withRole`, role helpers, `requireStorefrontAccess` |
| `errorHandler.ts` | `ApiError`, `Errors.*`, `errorResponse`, Prisma/Zod sanitization |
| `rateLimit.ts` | Older Redis ZSET helper (IP-keyed) |
| `withRateLimit.ts` | Preferred wrapper; uses `checkRateLimit` from `src/lib/rateLimit.ts` with presets `auth` / `mutation` / `upload` / `webhook` |

**Rate limit core** (`src/lib/rateLimit.ts`): Redis sliding window + in-memory fallback with cooldown circuit-breaker; `RATE_LIMIT_TIERS` for anonymous/customer/vendor/brand/admin.

Pattern: thin `src/app/api/v1/**/route.ts` → Zod validate → `src/modules/<domain>/*.service.ts`.

---

## 4. Modules under `src/modules/`

Bounded contexts (service layer). Validators/mappers often sit beside services.

| Module | Path | Responsibility |
|--------|------|----------------|
| **auth** | `auth/auth.service.ts`, `admin-password.service.ts`, validators | Auth-adjacent business ops, admin password reset/cipher |
| **brand** | `brand.service.ts`, `brand-mapper.ts`, validators | Brand portal, distributors, master products, mapping AI assist |
| **cart** | `cart.service.ts` | Server cart sync, vendor-grouped lines |
| **catalog** | `catalog.service.ts`, `search.service.ts`, `combo.service.ts`, `approval-state*`, `master-sync.service.ts`, bulk helpers | Products, categories, masters, search (`ILIKE` + `pg_trgm`), approvals |
| **commission** | `commission.service.ts` | Salesperson rules & accruals |
| **credit** | `credit.service.ts`, `creditWallet.service.ts` | DiSCCO credit + wallet-facing credit display |
| **fulfillment** | `fulfillmentRouter.service.ts`, `fulfillmentStock.ts` | Multi-outlet fulfillment routing / stock display |
| **import-export** | `excel.service.ts`, `brand-excel.service.ts`, `inventoryExcel.service.ts`, `import-commit.ts` | XLSX/CSV import-export pipelines |
| **inventory** | `inventory.service.ts` | Qty available / inventory mutations |
| **list** | `list.service.ts` | Quick Order Lists |
| **notification** | `notification.service.ts` | Persist `Notification` + enqueue BullMQ `notification` jobs |
| **order** | `order.service.ts`, `order-snapshots.ts` | Checkout → order lifecycle, delivery OTP, invoices trigger path |
| **payment** | `payment.service.ts` | Razorpay initiate/verify/webhook settlement |
| **pricing** | `pricing.service.ts`, `catalog-pricing.ts` | Bulk slabs, schemes, catalog price resolution |
| **promotion** | `promotion.service.ts`, mappers, catalog helpers | Coupons, BXGY, live promo evaluation |
| **return** | `return.service.ts` | Customer returns + vendor/admin refund processing |
| **vendor** | `vendor.service.ts`, `vendorOnboarding.service.ts`, `vendorSettlement.service.ts` | Vendor profile, onboarding, settlements / payouts |
| **warehouse** | `warehouse.service.ts` | GRN, dispatch, stock transfers (multi-warehouse) |

Frontend DAL / types (not under `modules/` but audit-relevant): `src/lib/dal.ts`, `src/types/index.ts`.

---

## 5. Events → queues → workers

### In-process event bus

- Types: `src/events/types.ts` (`EventMap` — orders, payments, stock, credit, catalog/brand lifecycle, lists, delivery OTP, …)
- Emitter: `src/events/emitter.ts` — `EventEmitter` singleton on **`globalThis`** (avoids silent drops across Next bundles)
- Listeners: `src/events/listeners.ts` — `registerEventListeners()`; side effects mostly call `NotificationService.send(...)`
- Registration: `src/instrumentation.ts` — Node runtime only; **production always**, or `REGISTER_EVENT_LISTENERS=true` in dev

### BullMQ

- Queue factory: `src/queues/setup.ts`
- Named queues: `QUEUE_NAMES.NOTIFICATION | INVOICE | RECONCILIATION`
- **Actively used:** `notification` — created in `NotificationService` (`createQueue('notification')`), consumed by `src/workers/notification.worker.ts`
- **INVOICE / RECONCILIATION queue names** are declared but **no `createQueue` callers** found for those names; reconciliation worker is a **direct script** polling Prisma + Razorpay (`src/workers/reconciliation.worker.ts`), not a BullMQ consumer of `QUEUE_NAMES.RECONCILIATION`

### Notification worker channels

`src/workers/notification.worker.ts` handles: `email`, `sms`, `whatsapp`, `push`, `in_app` (in_app = mark sent only). WhatsApp goes through `sendWhatsApp` stub/provider gate.

Scripts: `npm run worker:notifications`, `npm run worker:reconciliation`.

---

## 6. Third parties

| Vendor | Env keys (see `.env.example`) | Integration points |
|--------|-------------------------------|--------------------|
| **Razorpay** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `src/lib/razorpay.ts`, `src/modules/payment/`, webhook under `src/app/api/v1/payments/`, reconciliation worker |
| **ImageKit** | `IMAGEKIT_*`, `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | `src/lib/imagekit.ts`, upload APIs under `src/app/api/v1/upload/` |
| **Resend / SMTP** | `RESEND_API_KEY`, `EMAIL_FROM`; fallback `EMAIL_USER`/`EMAIL_PASS` | `src/lib/providers/email.ts` (DO blocks SMTP; Resend preferred in prod) |
| **MSG91** | `MSG91_AUTH_KEY`, templates, optional WhatsApp number/template | `src/lib/providers/sms.ts` |
| **WhatsApp** | `WHATSAPP_PROVIDER`, `WHATSAPP_API_KEY`, MSG91 WhatsApp vars | `src/lib/providers/whatsapp.ts` — **console stub** unless provider configured |
| **Sentry** | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | `withSentryConfig`, tunnel `/monitoring`, instrumentation |
| **Google Maps** | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Places autocomplete / geocoding hooks |
| **Embeddings / mapping AI** | `EMBEDDING_PROVIDER`, OpenAI/DeepSeek/Cohere/local, `MAPPING_AI_*` | Brand SKU mapping assist (`src/modules/brand/brand-mapper.ts`) |
| **Web Push** | VAPID-related (see push provider) | `src/lib/providers/push.ts`, `src/app/api/v1/push/` |

Local KYC uploads are **filesystem** (`/app/uploads` volume), served via authenticated route `src/app/api/v1/files/vendor-docs/[docId]/route.ts` — not ImageKit.

---

## 7. Dead / unfinished / stale surfaces

Use this section for QA scope trimming and security surface reduction.

### Intentionally removed / stripped (launch close-out)

Per `E2E_DEFECTS.md` (ship commit notes) and current tree:

| Surface | Status |
|---------|--------|
| **Wishlist UI** | Removed: no `WishlistContext`, no `WishlistOverlay`, no `src/app/wishlist/page.tsx`. Empty `src/app/wishlist/` directory may remain. `/wishlist` → 404. Residual helper: `wishlistStorageKey` in `src/lib/userScopedStorage.ts` (cleanup/migration only). No `/api/v1/wishlist` route. |
| **WhatsApp as customer-facing preference / credit enqueue** | Stripped from prefs / credit reminder enqueue per E2E. **Still present:** `NotificationChannel.whatsapp` in Prisma; worker + `src/lib/providers/whatsapp.ts` stub; API validator still lists `whatsapp` in `src/app/api/v1/notifications/route.ts`. Treat as dormant channel, not product feature. |

### Placeholder / mock / test pages (reachable unless blocked at edge)

| Path | Notes |
|------|-------|
| `src/app/under-construction/page.tsx` | Public placeholder. Linked from `src/components/layout/Footer.tsx` and Navbar “Offers” (`src/components/layout/Navbar.tsx` → `/under-construction`). |
| `src/app/product/_[id]/page.tsx` | **Stale mock PDP** (hardcoded demo products, Heart icons). Live PDP is `src/app/product/[id]/page.tsx`. Underscore segment is a separate route (`/_…` style folder name `_\[id\]`) — confirm URL reachability in audit browsing; do not confuse with production PDP. |
| `src/app/sentry-example-page/page.tsx` | Public Sentry test UI (`Sentry.captureException` / unhandled throw). **Security note:** remove or gate before hardening reviews; not behind `proxy` auth. |

### Schema / queue leftovers

- `QUEUE_NAMES.INVOICE` / `RECONCILIATION` declared in `src/queues/setup.ts` without matching producers found.
- `LinkedAccount` model retained; switching path is BusinessAccount-based.
- `SavedAddress` marked legacy-adjacent to Outlet in schema comments; dual paths may still exist in address APIs.

### Event listener registration gap (dev)

Listeners do **not** register in local `next dev` unless `REGISTER_EVENT_LISTENERS=true`. Notifications from events will not fire in default local runs (`src/instrumentation.ts`).

### Intentional non-claims (product / QA)

From `E2E_DEFECTS.md`: live Razorpay successful charge, automated salesman bank payout, product `platformCommission` fully driving settlement math — not asserted as complete.

---

## 8. Key file path index

### Boot & platform

| Path | Why it matters |
|------|----------------|
| `package.json` | Scripts, dependency versions |
| `next.config.ts` | Standalone, Sentry, headers, image remotePatterns |
| `src/instrumentation.ts` | Sentry init, env validate, event listeners |
| `src/proxy.ts` | Edge page auth / role gates |
| `src/auth.ts` | Auth.js providers + JWT callbacks |
| `src/lib/env.ts` | Required env fail-fast |
| `src/lib/prisma.ts` | DB client |
| `src/lib/redis.ts` | App Redis |
| `.env.example` | Env catalog for auditors |

### Auth, tenancy, permissions

| Path | Why it matters |
|------|----------------|
| `src/middleware/auth.ts` | `withAuth` / `AuthContext` |
| `src/middleware/rbac.ts` | Role + storefront gates |
| `src/middleware/errorHandler.ts` | API error contract |
| `src/middleware/withRateLimit.ts` | Route rate limits |
| `src/lib/rateLimit.ts` | Redis/memory limiter |
| `src/lib/activeContext.ts` | BA/outlet/permissions into JWT |
| `src/lib/resolveVendorId.ts` | Vendor tenancy + admin view |
| `src/lib/resolveBrandId.ts` | Brand tenancy + admin view |
| `src/lib/resolveBusinessAccountContext.ts` | V2.2 BA context |
| `src/lib/resolveVendorOutletContext.ts` | Warehouse/outlet scope |
| `src/lib/resolveCustomerImpersonation.ts` | Customer Admin View |
| `src/lib/adminImpersonationCookies.ts` | Impersonation cookie clear/set names |
| `src/lib/permissions/registry.ts` | Permission keys |
| `src/lib/permissions/engine.ts` | `requirePermission` / flatten |
| `src/types/next-auth.d.ts` | Session/JWT typing |
| `prisma/schema.prisma` | Canonical data model |

### Events & workers

| Path | Why it matters |
|------|----------------|
| `src/events/types.ts` | Event catalog |
| `src/events/emitter.ts` | Bus singleton |
| `src/events/listeners.ts` | Side-effect wiring |
| `src/queues/setup.ts` | BullMQ helpers / queue names |
| `src/workers/notification.worker.ts` | Delivery worker |
| `src/workers/reconciliation.worker.ts` | Razorpay safety net |

### Integrations

| Path | Why it matters |
|------|----------------|
| `src/lib/razorpay.ts` | Payments client |
| `src/lib/imagekit.ts` | Media client |
| `src/lib/providers/email.ts` | Email |
| `src/lib/providers/sms.ts` | SMS (+ WhatsApp transport) |
| `src/lib/providers/whatsapp.ts` | WhatsApp stub/gate |
| `src/lib/providers/push.ts` | Web push |
| `src/modules/payment/payment.service.ts` | Payment domain |
| `src/modules/notification/notification.service.ts` | Notify + enqueue |

### Deploy

| Path | Why it matters |
|------|----------------|
| `docker/docker-compose.prod.yml` | Prod topology |
| `docker/Dockerfile` | App + worker images |
| `docker/nginx.conf` | TLS, proxy buffers, redirects |
| `ecosystem.config.js` | Legacy PM2 layout |

### App surfaces (high traffic / portals)

| Area | Paths |
|------|--------|
| Storefront | `src/app/page.tsx`, `product/[id]/`, `vendor/[id]/`, `cart/`, `checkout/`, `search/`, `orders/` |
| Customer account | `src/app/profile/`, `account/[id]/`, `order-lists/`, `rewards/`, `wallet/` |
| Vendor portal | `src/app/vendor/(dashboard)/`, `vendor/register/` |
| Brand portal | `src/app/brand/portal/`, `brand/register/` |
| Admin | `src/app/admin/**` |
| APIs | `src/app/api/auth/[...nextauth]/`, `src/app/api/v1/**` |
| Product card | `src/components/features/vendor/VendorProductCard.tsx` |

### API v1 top-level resource folders

Under `src/app/api/v1/`:  
`account`, `addresses`, `admin`, `auth`, `brand`, `brand-master-products`, `brands`, `cart`, `categories`, `checkout`, `collections`, `config`, `credit`, `files`, `health`, `inventory`, `lists`, `master-products`, `me`, `notifications`, `orders`, `payments`, `permissions`, `products`, `promotions`, `push`, `search`, `upload`, `vendor`, `vendors`, `wallet`.

### Stale / audit-sensitive pages

| Path | Note |
|------|------|
| `src/app/sentry-example-page/page.tsx` | Public error trigger |
| `src/app/under-construction/page.tsx` | Placeholder |
| `src/app/product/_[id]/page.tsx` | Mock PDP |
| `src/app/wishlist/` | Empty dir remnant |

### QA ledger

| Path | Note |
|------|------|
| `E2E_DEFECTS.md` | Launch defect ledger, impersonation fixtures, intentional non-claims |

---

## Audit quick tips

1. **Page auth ≠ API auth.** Edge `proxy.ts` skips `/api`; every sensitive route must use `withAuth` / `withRole` / `adminOnly` / `vendorOnly` / `brandOnly` and tenancy resolvers.
2. **Trust JWT BA flags** for actor type, but **scope queries** with `resolveVendorContext` / `resolveBrandContext` / BA id — never accept client-supplied vendorId as sole authority.
3. **Impersonation cookies** are powerful: verify httpOnly, clear-on-logout, permission gates on set endpoints, and that customer Admin View uses `effectiveCustomerUserId`.
4. **Workers** need the same secrets as the app (`DATABASE_URL`, `REDIS_URL`, MSG91/Resend/Razorpay) and must stay off the public network.
5. **Remove or protect** `sentry-example-page` and decide fate of `product/_[id]` + under-construction nav links before a hardened release.

---

*Generated for security/QA audit documentation. Re-verify paths against the current commit when auditing a specific deploy image.*

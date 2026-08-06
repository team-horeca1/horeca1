# CLAUDE.md — Horeca1 (HoReCa Hub)
Read this file at the start of every session.

## PROJECT OVERVIEW
**HoReCa Hub** is a B2B marketplace where restaurants, hotels, caterers, and bakeries buy food and supplies in bulk from verified vendors. Think Swiggy-style vendor marketplace, but for procurement: vendor-grouped cart, bulk price tiers, DiSCCO credit, delivery-slot booking, multi-vendor checkout.

**Tech stack:** Next.js 16 App Router · React 19 · TypeScript (strict) · Tailwind CSS 4 · Framer Motion · Prisma 7 · PostgreSQL 16 · Auth.js v5 (JWT) · BullMQ + Redis 7 · Razorpay (payments) · ImageKit (media) · Resend (email) · MSG91 (SMS) · Sentry (monitoring) · Google Maps · Docker Compose · Nginx · PM2.

**Deployed at:** `http://64.227.187.210/` — single DigitalOcean Droplet ($29/mo), Docker Compose (app + postgres + redis + nginx), deploy via `ssh root@64.227.187.210 "bash /opt/horeca1/deploy.sh"`.

**Key domain concepts:**
- Cart is **vendor-grouped** — items from different vendors create separate POs at checkout.
- Products have **bulk price slabs** (up to 3 tiers) for quantity-based discounts.
- Orders move through: `draft → pending → confirmed → processing → out_for_delivery → delivered`.
- **Quick Order Lists** are reusable procurement templates (distinct from cart).
- **Multi-tenancy** is enforced per-query via `resolveVendorContext` / `resolveBrandContext` helpers.

## ARCHITECTURE
```
src/
├── app/
│   ├── (routes)/              # Homepage, cart, checkout, orders, product, vendor, search, etc.
│   ├── admin/                 # Admin dashboard (approvals, vendors, orders, finance, team, reports)
│   ├── vendor/(dashboard)/    # Vendor portal (inventory, orders, products, settings)
│   ├── brand/portal/          # Brand portal (products, mappings, settings)
│   └── api/
│       ├── auth/              # Auth.js catch-all route
│       └── v1/                # All business APIs (~100 routes across vendors, products, orders, payments, cart, lists, admin, brand, vendor, credit, notifications)
├── modules/                   # Service layer — one folder per bounded context
│   ├── auth/  catalog/  cart/  order/  payment/  credit/
│   ├── inventory/  list/  notification/  brand/  vendor/  import-export/
├── workers/                   # BullMQ workers (notification.worker.ts)
├── queues/                    # BullMQ queue setup
├── components/
│   ├── layout/                # Navbar, Footer, MobileBottomNav, overlays
│   ├── features/              # Feature-grouped (homepage/, vendor/, order-lists/, auth/, checkout/, product/, brand/)
│   ├── auth/  ui/  providers/
├── context/                   # CartContext, WishlistContext, AddressContext (React Context, no Redux)
├── lib/
│   ├── dal.ts                 # Data-Access Layer — transforms Prisma rows into frontend types
│   ├── prisma.ts  redis.ts
│   ├── rateLimit.ts           # Redis-backed sliding window + in-memory circuit breaker
│   ├── auditLog.ts            # Fire-and-forget audit logger for admin mutations
│   ├── utils.ts  auth-helpers.ts
│   └── providers/email.ts     # Resend adapter (fallback: console log)
│   └── providers/sms.ts       # MSG91 adapter (fallback: console log)
├── middleware/                # auth.ts, rateLimit.ts, errorHandler.ts
├── events/emitter.ts          # Singleton event bus → enqueues BullMQ jobs
├── types/index.ts             # All frontend type contracts (VendorProduct, Order, etc.)
└── hooks/                     # useGooglePlacesAutocomplete, etc.

prisma/schema.prisma           # 39 models (see DATABASE below)
prisma/migrations/             # 16 migrations, all applied on prod
docker/                        # docker-compose.prod.yml + nginx.conf
ecosystem.config.js            # PM2 (used on droplet? check — Docker is the primary deploy path)
```

**Key file:** `src/components/features/vendor/VendorProductCard.tsx` is the primary product card — handles bulk slabs (3 tiers), credit badges, cart + wishlist.

## CODE CONVENTIONS
- **TypeScript strict** — never use `any`. Use `unknown` + narrow, `Record<string, unknown>` for JSON, or inline the type.
- **Tailwind only** — no inline styles. Prefer `clamp()` fluid responsive over breakpoint classes: `text-[clamp(2rem,5vw+1rem,4rem)]` not `text-4xl md:text-5xl`.
- **Server components by default** — add `'use client'` only for interactivity, context consumers, or animations.
- **API routes:** `src/app/api/v1/<resource>/route.ts`. Handlers stay thin (5–15 lines) — they validate with Zod, then delegate to `src/modules/<domain>/<domain>.service.ts`.
- **Component files:** PascalCase. Utility files: camelCase. Path alias `@/*` → `src/*`.
- **setState inside useEffect** — if lint flags `react-hooks/set-state-in-effect`, wrap with `Promise.resolve().then(() => setState(...))`.
- **No test suite** — verify changes at `localhost:3000` after `npm run dev`, or run `npx tsc --noEmit && npm run lint`.
- **Auth:** Auth.js v5 with JWT sessions. `withAuth(handler)` wraps protected routes and injects `session` + `user`.
- **Multi-tenancy:** every vendor/brand read MUST go through `resolveVendorContext(session)` or `resolveBrandContext(session)` — they return the scoped ID or 403.
- **Rate limiting:** Redis-backed ZSET sliding window (`src/lib/rateLimit.ts`) with an in-memory circuit-breaker fallback. `RATE_LIMIT_TIERS` exports per-role caps.
- **Audit log:** fire-and-forget — `logAction({ actorId, action, entity, ... })` never blocks the response. Use `AUDIT_ACTIONS` constants.
- **Events:** emit via `src/events/emitter.ts` — it enqueues a BullMQ job. Workers consume from the `notification` queue.

## DATABASE
PostgreSQL 16 (self-hosted, Docker). 37 Prisma models. Core groupings:

**Auth & Identity**
- `User` — root account (email, phone, passwordHash, role, profileCompletedAt, locale)
- `Account` / `Session` / `VerificationToken` — Auth.js adapter tables
- `LinkedAccount` — multi-profile linking (customer↔vendor↔brand)
- `SavedAddress` — user's saved delivery addresses with lat/lng

**Catalog**
- `Vendor` — stores, MOV, service areas, team; status lifecycle (pending→approved)
- `ServiceArea` — pincode coverage per vendor
- `DeliverySlot` — per-vendor slot + cutoff time
- `Category` — hierarchical, slug-based
- `Product` — with `categoryId` (primary) + `ProductCategory` join (multi-category)
- `PriceSlab` — bulk pricing tiers (up to 3 per product)
- `Collection` / `CollectionProduct` — curated sets
- `Inventory` — qtyAvailable per product

**Cart & Orders**
- `Cart` / `CartItem` — server-synced cart (also mirrored in localStorage)
- `Order` / `OrderItem` — one Order per vendor (vendor-grouped checkout)
- `Review` — per-order product reviews

**Lists & Saved**
- `QuickOrderList` / `QuickOrderListItem` — reusable procurement templates (scoped per vendor or cross-vendor)
- `CustomerVendor` — follow/unfollow

**Payments & Credit**
- `Payment` — Razorpay order + payment IDs + signature verify state
- `CreditAccount` / `CreditTransaction` — DiSCCO B2B credit
- `Wallet` / `WalletTransaction` — prepaid balance

**Notifications**
- `Notification` — channel (email/sms/whatsapp/in_app/push), status (pending/sent/failed), body/subject

**Brand (separate actor)**
- `Brand` — approved brands
- `BrandMasterProduct` — brand's canonical SKUs
- `BrandProductMapping` — brand SKU → vendor product mapping

**Teams (RBAC)**
- `VendorTeamMember` / `BrandTeamMember` / `AdminTeamMember` — role = owner/manager/editor/viewer

**Audit**
- `AuditLog` — append-only, JSON before/after for admin mutations

## RECURRING COMMANDS
```bash
npm run dev:db                 # Postgres + Redis (Docker, once per session)
npm run dev                    # Next.js Turbopack in Docker → localhost:3000
npm run dev:tunnel             # Same + prod DB via `npm run tunnel` in another terminal
npm run dev:webpack            # Fallback: Webpack on the host (Windows only if Docker unavailable)
npm run build                  # Production build (Turbopack — Next.js 16 default)
npm run lint                   # ESLint — 0 errors currently, ~246 warnings (<img> in admin/brand pages + unused)
npx tsc --noEmit               # Type check (always run before commit)
npx prisma migrate dev         # Apply migrations locally
npx prisma studio              # DB browser
npm run worker:notifications   # Run notification worker locally
npx tsx prisma/scripts/seed-finance-demo.ts   # Finance demo orders/settlements (after db seed)
```

**Deploy (prod):**
Normal path is automatic — pushing to `master` runs `.github/workflows/ci-deploy.yml`, which gates on type-check/lint plus a migration-drift rebuild, builds the images on GitHub, pushes them to GHCR, then SSHes into the droplet and runs `deploy.sh`. Only `team-horeca1/horeca1` deploys; the `AneeVerse` mirror skips build/deploy so two runs can't race the same droplet.

When Actions cannot schedule runners (GitHub outages), deploy the already-built image yourself:
```bash
npm run deploy:prod                    # newest pushed image (:latest)
npm run deploy:prod -- --sha=<commit>  # pin an exact commit
```
`deploy.sh` pulls the SHA-pinned GHCR images, reconciles known migration drift, runs `prisma migrate deploy`, recreates app + worker, restarts nginx, and health-checks. Takes ~2 min. Images are public, so a pull needs no token — if an expired CI login is cached on the droplet the script clears it and retries.

## ENVIRONMENT VARIABLES
Defined in `.env.example` (dev) and `.env.production` (on the droplet). Required:

- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET` — Auth.js JWT signing key (32-char random)
- `AUTH_URL` — base URL for callbacks
- `REDIS_URL` — BullMQ + rate limiter + cache
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — payments
- `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` — media
- `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` — Nodemailer + Gmail SMTP (invite, invoice, OTP email; falls back to console log if unset in dev)
- `MSG91_AUTH_KEY` — SMS/OTP (falls back to console log if unset)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error tracking
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Maps JS + Places + Geocoding

## CRITICAL PATTERNS
### Fluid responsive design (enforced)
```tsx
// Preferred
<h1 className="text-[clamp(2rem,5vw+1rem,4rem)]">
<div className="p-[clamp(1rem,3vw,3rem)]">

// Avoid
<h1 className="text-4xl md:text-5xl lg:text-6xl">
```

### Lazy-load heavy components
```tsx
const HeavyComponent = dynamic(() => import('./HeavyComponent'), { ssr: false });
```

### Performance targets
LCP < 2.5s · FID < 100ms · CLS < 0.1 · TTI < 3.5s

## CURRENT STATUS (updated 2026-04-22)
- Phases 1–5.5 shipped + all P0/P1 features except WhatsApp channel (see [ROADMAP.md](ROADMAP.md) for what's left)
- Phase 4.3 (i18n / language switcher) deliberately deferred
- Zero TS errors, 0 lint errors (~246 warnings remain — `<img>` in admin/brand portal pages)
- **What's live on `64.227.187.210`:**
  - Full marketplace: homepage, vendor stores, product pages, cart, checkout with delivery slots, order tracking
  - Bulk price slabs (3 tiers), MOV enforcement, OOS alternate vendor suggestions, pincode service-area gate
  - Vendor portal: inventory, orders, products (with brand dropdown from DB), settings + document upload
  - Admin portal: dashboard, orders, vendors (with document verification UI), products, categories, approvals, returns review, brands, finance, reports, team
  - Payments: Razorpay initiate + verify + webhook (server-to-server, HMAC-verified)
  - Invoice PDF: GST-compliant, downloadable from order detail page
  - Returns: customer request flow + admin approve/reject/refund UI
  - Vendor document verification: upload (vendor settings) + admin verify/reject (admin vendor detail)
  - Notifications: BullMQ worker, email (Resend) + SMS (MSG91) live, WhatsApp stubbed
  - Search: ILIKE exact match + `pg_trgm` fuzzy (typo tolerance)
  - Auth: Auth.js v5 JWT, RBAC, team scoping
  - Audit log, Redis rate limiter, multi-tenancy enforced
  - Image optimization: Next.js `<Image>` on all high-traffic pages (hero, navbar, vendor cards, categories, checkout)
- 16 Prisma migrations applied
- Knowledge graph (code-review-graph MCP) is available — see below

## MCP Tools: code-review-graph
**Use graph tools BEFORE Grep/Glob/Read** — faster, cheaper, gives structural context.

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — risk-scored |
| `get_review_context` | Source snippets for review — token-efficient |
| `get_impact_radius` | Blast radius of a change |
| `get_affected_flows` | Which execution paths are impacted |
| `query_graph` | Callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Find functions/classes by name/keyword |
| `get_architecture_overview` | High-level structure |
| `refactor_tool` | Plan renames, find dead code |

Graph auto-updates on file changes. Fall back to Grep/Read only when the graph doesn't cover what you need.

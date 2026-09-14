# Horeca1 — Full Project Status

> **Last Updated:** 2026-03-19
> **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Prisma 7 + PostgreSQL + Redis
> **Hosting:** Single DigitalOcean Droplet ($29/mo) — self-hosted everything
> **Architecture:** Monolith (frontend + backend in one Next.js app) — splittable later

---

## What Is This Project?

**Horeca1** is a B2B e-commerce marketplace where restaurants, hotels, and catering businesses buy food and supplies from multiple vendors. Think "Swiggy for bulk wholesale procurement."

**Key Business Features:**
- Multi-vendor marketplace with vendor-grouped cart
- Bulk price tiers (buy more = pay less per unit)
- Quick Order Lists (reusable procurement templates)
- DiSCCO credit system (vendor-funded credit lines)
- Order lifecycle tracking (pending → confirmed → processing → shipped → delivered)
- Razorpay payments (India-native)
- Admin dashboard for managing vendors, customers, orders, finance

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE NEXT.JS APP                        │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   FRONTEND   │    │   BACKEND    │    │   DATABASE   │   │
│  │              │    │              │    │              │   │
│  │ src/app/     │───>│ src/app/     │───>│ prisma/      │   │
│  │ (pages)      │    │ api/v1/      │    │ schema.prisma│   │
│  │              │    │ (routes)     │    │              │   │
│  │ src/         │    │              │    │ PostgreSQL   │   │
│  │ components/  │    │ src/modules/ │    │ (Docker)     │   │
│  │ (60+ comps)  │    │ (services)   │    │              │   │
│  │              │    │              │    │ Redis        │   │
│  │ src/context/ │    │ src/         │    │ (Docker)     │   │
│  │ (state)      │    │ middleware/  │    │              │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Why monolith?** Shared TypeScript types, one deployment, faster development, cheaper hosting. Can split into separate frontend + backend servers later (see "Splitting Strategy" section at bottom).

---

## What's DONE (Week 1 — Infrastructure)

### Database Schema — `prisma/schema.prisma`
| Status | Model | Purpose |
|--------|-------|---------|
| ✅ | Account, Session, VerificationToken | Auth.js v5 session management |
| ✅ | User | Customers, vendors, admins (role-based) |
| ✅ | Vendor | Vendor profiles, MOV, credit settings |
| ✅ | ServiceArea | Pincode-based delivery zones |
| ✅ | DeliverySlot | Time slots per vendor per day |
| ✅ | CustomerVendor | Follow/favorite vendor relationships |
| ✅ | Category | Hierarchical product categories (parent/child) |
| ✅ | Product | Products with vendor, category, base price |
| ✅ | PriceSlab | Bulk pricing tiers (qty ranges → prices) |
| ✅ | Collection, CollectionProduct | Curated product collections |
| ✅ | Inventory | Stock tracking with low-stock alerts |
| ✅ | Cart, CartItem | Server-side cart (vendor-grouped) |
| ✅ | Order, OrderItem | Purchase orders with status lifecycle |
| ✅ | Payment | Razorpay payment records |
| ✅ | CreditAccount, CreditTransaction | DiSCCO credit system |
| ✅ | Wallet, WalletTransaction | User wallet for refunds/cashback |
| ✅ | Notification | Multi-channel notifications |
| ✅ | **6 Enums** | Role, OrderStatus, PaymentState, PaymentStatus, CreditStatus, CreditTxnType, WalletTxnType, NotificationChannel, NotificationStatus |

**Total: 24+ models, 9 enums, full indexes and constraints**

---

### Backend Modules — `src/modules/`
Each module co-locates its service + validator (+ events/queue where needed).

| Status | Module | Files | What It Does |
|--------|--------|-------|-------------|
| ✅ | `auth/` | auth.service.ts, auth.validator.ts | Signup (bcrypt), login, profile CRUD |
| ✅ | `vendor/` | vendor.service.ts, vendor.validator.ts | Vendor list (cursor pagination), detail, follow/unfollow, serviceability check |
| ✅ | `catalog/` | catalog.service.ts, catalog.validator.ts, search.service.ts | Products CRUD, categories, collections, text search |
| ✅ | `inventory/` | inventory.service.ts, inventory.validator.ts | Stock check, update, bulk check, reserve/release (transactional) |
| ✅ | `order/` | order.service.ts, order.validator.ts | Full PO creation (validate stock → check MOV → bulk pricing → create order → reserve inventory → clear cart), list, status updates |
| ✅ | `cart/` | cart.service.ts, cart.validator.ts | Vendor-grouped cart, add/update/remove items, bulk price lookup |
| ✅ | `payment/` | payment.service.ts, payment.validator.ts | Razorpay order creation, HMAC signature verification |
| ✅ | `credit/` | credit.service.ts, credit.validator.ts | DiSCCO credit check, apply (transactional debit), signup, approve |
| ✅ | `notification/` | notification.service.ts | Send (create + queue BullMQ job), list (cursor pagination), mark read |
| ✅ | `list/` | list.service.ts, list.validator.ts | Quick Order Lists CRUD, add/remove items |

**Total: 10 modules, 20 files — all business logic written**

---

### Infrastructure — `src/middleware/`, `src/events/`, `src/queues/`, `src/lib/`

| Status | File | Purpose |
|--------|------|---------|
| ✅ | `middleware/auth.ts` | Auth.js session extraction, `withAuth()` wrapper for protected routes |
| ✅ | `middleware/rbac.ts` | Role checks: `withRole()`, `adminOnly()`, `vendorOnly()`, `customerOnly()` |
| ✅ | `middleware/errorHandler.ts` | `ApiError` class, Zod error handling, error factories (notFound, unauthorized, etc.) |
| ✅ | `middleware/rateLimit.ts` | Redis sliding window rate limiter |
| ✅ | `events/types.ts` | 14 typed event payloads (OrderCreated, PaymentReceived, StockUpdated, etc.) |
| ✅ | `events/emitter.ts` | Type-safe EventEmitter singleton — `emitEvent("OrderCreated", payload)` |
| ✅ | `queues/setup.ts` | BullMQ queue/worker factory, Redis connection, queue names |
| ✅ | `lib/prisma.ts` | Prisma singleton client (dev logging) |
| ✅ | `lib/redis.ts` | Redis singleton (BullMQ-compatible) |
| ✅ | `lib/razorpay.ts` | Razorpay SDK singleton |
| ✅ | `lib/imagekit.ts` | ImageKit SDK singleton (@imagekit/nodejs) |
| ✅ | `auth.ts` | Auth.js v5 config — Credentials provider, PrismaAdapter, JWT strategy |

---

### DevOps — `docker/`

| Status | File | Purpose |
|--------|------|---------|
| ✅ | `docker-compose.yml` | Local dev: PostgreSQL 17 + Redis 7 with health checks |
| ✅ | `docker-compose.prod.yml` | Production: Next.js + PostgreSQL + Redis + Nginx + Certbot (SSL) |
| ✅ | `Dockerfile` | Multi-stage build (deps → builder → runner), node:22-alpine |
| ✅ | `nginx.conf` | Reverse proxy → app:3000, WebSocket support, Let's Encrypt |
| ✅ | `backup.sh` | Daily pg_dump → gzip → DigitalOcean Spaces (30-day retention) |

---

### Seed Data — `prisma/seed.ts`

| Status | Data | Details |
|--------|------|---------|
| ✅ | 1 Admin | admin@horeca1.com |
| ✅ | 5 Vendors | Daily Fresh Foods, Spice Trail India, MeatHouse India, BeverageCo, Pack & Serve Supplies |
| ✅ | 3 Customers | Taj Palace Restaurant, Green Leaf Cafe, Grand Hyatt Kitchen |
| ✅ | 10 Categories | Vegetables, Fruits, Dairy, Spices, Grains, Meat, Seafood, Beverages, Oils, Packaging |
| ✅ | 43 Products | Realistic HORECA items across all vendors, with pack sizes and units |
| ✅ | 129 Price Slabs | 3 bulk tiers per product (1-9, 10-49, 50+) with 5%/10% discounts |
| ✅ | 43 Inventory records | Realistic stock levels with low-stock thresholds |
| ✅ | Service Areas | 8 Mumbai pincodes per vendor |
| ✅ | Delivery Slots | Mon-Sat, 2 slots/day (morning + afternoon) |
| ✅ | Customer-Vendor links | Follow/favorite relationships |
| ✅ | 3 Collections | Weekend Specials, Kitchen Essentials, New Arrivals |
| ✅ | 2 Credit Accounts | Active credit lines for customer → vendor |
| ✅ | 3 Wallets | One per customer |

---

### Config Files

| Status | File | Purpose |
|--------|------|---------|
| ✅ | `.env` | Local database URL |
| ✅ | `.env.example` | Template with all required env vars |
| ✅ | `prisma.config.ts` | Prisma 7 datasource config |
| ✅ | `package.json` | Updated with all backend deps + prisma seed config |
| ✅ | `CLAUDE.md` | Project conventions and architecture guide |

---

### Existing Frontend (Built Before Backend) — 60+ Components

| Status | Area | Routes / Components |
|--------|------|-------------------|
| ✅ | Homepage | `/` — hero, categories, vendor promos, trending |
| ✅ | Vendor Store | `/vendor/[id]` — storefront with product catalog |
| ✅ | Product Detail | `/product/[id]` — full product page |
| ✅ | Categories | `/category/[slug]/[categoryId]` — category browsing |
| ✅ | Cart | `/cart` — vendor-grouped cart with MOV checks |
| ✅ | Checkout | `/checkout` — delivery slot selection, payment |
| ✅ | Orders | `/orders` — order history and tracking |
| ✅ | Order Lists | `/order-lists`, `/order-lists/[id]` — procurement templates |
| ✅ | Wishlist | `/wishlist` |
| ✅ | Profile | `/profile` |
| ✅ | Search | Search overlay in navbar |
| ✅ | Vendors List | `/vendors` |
| ✅ | Admin | 7 admin pages (dashboard, orders, customers, vendors, approvals, finance, reports) |
| ✅ | Auth | Login overlay, auth screens (13 auth components) |
| ✅ | Layout | Navbar, Footer, MobileBottomNav, location/pincode overlays |
| ⚠️ | Data Source | **Currently using mock data** (`mockData.ts`, `vendorData.ts`) — needs migration to real API |

**Total: 26 routes, 61 components, 3 React contexts (Cart, Wishlist, Address)**

---

## What's LEFT — Weeks 2-8

### Week 2: Auth Module (API Routes + Frontend Connection)

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/auth/signup/route.ts` | POST — create account, return JWT |
| ❌ | `src/app/api/v1/auth/[...nextauth]/route.ts` | Auth.js catch-all (login, session, callbacks) |
| ❌ | `src/app/api/v1/auth/me/route.ts` | GET — current user profile |
| ❌ | `src/context/AuthContext.tsx` | New context wrapping Auth.js SessionProvider |
| ❌ | Connect LoginOverlay | Wire existing auth components to real signup/login |
| ❌ | Protected route middleware | `middleware.ts` at app root — redirect unauthenticated users |

---

### Week 3: Vendor + Catalog Module

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/vendors/route.ts` | GET — list vendors (cursor pagination, pincode filter) |
| ❌ | `src/app/api/v1/vendors/[id]/route.ts` | GET — vendor detail |
| ❌ | `src/app/api/v1/vendors/[id]/products/route.ts` | GET — vendor products with price slabs |
| ❌ | `src/app/api/v1/vendors/my-vendors/route.ts` | GET — followed vendors for logged-in user |
| ❌ | `src/app/api/v1/vendors/[id]/follow/route.ts` | POST/DELETE — follow/unfollow vendor |
| ❌ | `src/app/api/v1/categories/route.ts` | GET — category tree |
| ❌ | `src/app/api/v1/categories/[id]/vendors/route.ts` | GET — vendors in a category |
| ❌ | `src/app/api/v1/search/route.ts` | GET — text search (products, vendors, categories) |
| ❌ | `src/lib/dal/` | Data Access Layer — bridge mock data → API calls |
| ❌ | Migrate homepage | Homepage components fetch from API instead of mockData |
| ❌ | Migrate vendor pages | Vendor store + product catalog from API |

---

### Week 4: Cart + Orders

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/cart/route.ts` | GET/POST/PUT/DELETE — server-side cart |
| ❌ | `src/app/api/v1/orders/route.ts` | GET — list orders, POST — create PO |
| ❌ | `src/app/api/v1/orders/[id]/route.ts` | GET — order detail |
| ❌ | `src/app/api/v1/orders/[id]/status/route.ts` | PATCH — update status (vendor/admin) |
| ❌ | `src/app/api/v1/orders/[id]/reorder/route.ts` | POST — reorder from previous order |
| ❌ | Update CartContext | localStorage (guests) + API sync (authenticated) |
| ❌ | Connect checkout flow | Cart → checkout → order creation |
| ❌ | Connect order history | Orders page fetches from API |

---

### Week 5: Payments + Event Listeners

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/payments/initiate/route.ts` | POST — create Razorpay order |
| ❌ | `src/app/api/v1/payments/verify/route.ts` | POST — verify Razorpay signature |
| ❌ | `src/app/api/v1/payments/webhook/route.ts` | POST — Razorpay webhook handler |
| ❌ | Event listeners per module | OrderCreated → reserve stock, send notification, etc. |
| ❌ | BullMQ workers | notification.worker.ts, invoice.worker.ts |
| ❌ | Razorpay frontend integration | Checkout page → Razorpay SDK → verify |

---

### Week 6: Quick Order Lists + Credit + Notifications

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/lists/route.ts` | GET/POST — list management |
| ❌ | `src/app/api/v1/lists/[id]/route.ts` | GET/DELETE — list detail |
| ❌ | `src/app/api/v1/lists/[id]/items/route.ts` | POST/DELETE — manage list items |
| ❌ | `src/app/api/v1/lists/[id]/order/route.ts` | POST — order from list |
| ❌ | `src/app/api/v1/credit/route.ts` | Credit check, apply, signup, approve |
| ❌ | `src/app/api/v1/notifications/route.ts` | GET — list notifications |
| ❌ | `src/app/api/v1/notifications/read/route.ts` | POST — mark read |
| ❌ | Connect order-lists pages | Order lists page fetches from API |
| ❌ | Notification UI | In-app notification bell + list |

---

### Week 7: Admin + Search

| Status | Task | Details |
|--------|------|---------|
| ❌ | `src/app/api/v1/admin/dashboard/route.ts` | GET — stats (total orders, revenue, users) |
| ❌ | `src/app/api/v1/admin/users/route.ts` | GET/PATCH — user management |
| ❌ | `src/app/api/v1/admin/vendors/route.ts` | GET/PATCH — vendor approval/management |
| ❌ | `src/app/api/v1/admin/orders/route.ts` | GET — all orders with filters |
| ❌ | Connect admin dashboard | All 7 admin pages fetch from API |
| ❌ | PostgreSQL full-text search | tsvector + GIN index on products |
| ❌ | Redis caching | Cache vendor data, search results, category tree |

---

### Week 8: Deploy to DigitalOcean

| Status | Task | Details |
|--------|------|---------|
| ❌ | Provision Droplet | $24/mo — 2 vCPU, 4GB RAM, 80GB SSD |
| ❌ | Deploy via Docker Compose | `docker-compose.prod.yml` with Nginx + SSL |
| ❌ | `prisma migrate deploy` | Run migrations on production PostgreSQL |
| ❌ | Seed production data | Admin user + initial categories |
| ❌ | DNS configuration | Point domain to Droplet IP |
| ❌ | SSL via Certbot | Let's Encrypt auto-renewal |
| ❌ | Backup cron job | Daily pg_dump → DigitalOcean Spaces |
| ❌ | GitHub Actions CI/CD | `.github/workflows/ci.yml` + `deploy.yml` |
| ❌ | Sentry setup | `@sentry/nextjs` for error tracking |

---

## Pre-Requisites (Before Week 2 Can Start)

These must be done manually on your machine:

| Status | Task | Command |
|--------|------|---------|
| ❌ | Install Docker Desktop | Download from docker.com |
| ❌ | Start containers | `docker compose -f docker/docker-compose.yml up -d` |
| ❌ | Run first migration | `npx prisma migrate dev --name init_schema` |
| ❌ | Seed database | `npx prisma db seed` |
| ❌ | Verify with Prisma Studio | `npx prisma studio` (opens at localhost:5555) |

---

## File Count Summary

| Layer | Files | Status |
|-------|-------|--------|
| Prisma schema + seed | 2 | ✅ Done |
| Backend modules (services + validators) | 20 | ✅ Done |
| Middleware | 4 | ✅ Done |
| Events + Queues | 3 | ✅ Done |
| Lib clients | 7 | ✅ Done |
| Auth config | 1 | ✅ Done |
| Docker + DevOps | 5 | ✅ Done |
| Config files | 4 | ✅ Done |
| **Backend total** | **46** | **✅ All business logic done** |
| | | |
| API route handlers | ~35 | ❌ Week 2-7 |
| Event listeners | ~10 | ❌ Week 5 |
| BullMQ workers | ~3 | ❌ Week 5 |
| DAL bridge layer | ~5 | ❌ Week 3 |
| Frontend auth context | 1 | ❌ Week 2 |
| CI/CD workflows | 2 | ❌ Week 8 |
| **Remaining** | **~56** | **❌ Weeks 2-8** |
| | | |
| Frontend pages | 26 | ✅ Already built |
| Frontend components | 61 | ✅ Already built |
| Frontend contexts | 3 | ✅ Already built (need API wiring) |
| **Frontend total** | **90** | **✅ Built, needs data migration** |

---

## Cost Plan

| Phase | Users | Infra | Monthly Cost |
|-------|-------|-------|-------------|
| Phase 1 (launch) | 0-5K | 1 Droplet + Spaces | $29/mo (₹2,465) |
| Phase 2 (growth) | 5K-20K | Bigger Droplet + Spaces | $53/mo (₹4,500) |
| Phase 3 (scale) | 20K-50K | 2 Droplets + LB + Spaces | $100/mo (₹8,500) |

---

## Login Credentials (Seed Data)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@horeca1.com | admin123 |
| Vendor | fresh@dailyfreshfoods.com | vendor123 |
| Vendor | owner@spicetrail.in | vendor123 |
| Customer | chef@tajpalace.com | customer123 |
| Customer | owner@greenleafcafe.com | customer123 |

---

## Dependencies

```json
{
  "production": {
    "@prisma/client": "^7.5.0",
    "@auth/prisma-adapter": "^2.11.1",
    "next-auth": "^5.0.0-beta.30",
    "zod": "^4.3.6",
    "bcryptjs": "^3.0.3",
    "bullmq": "^5.71.0",
    "ioredis": "^5.10.0",
    "razorpay": "^2.9.6",
    "@imagekit/nodejs": "^7.3.0",
    "swr": "^2.4.1",
    "@sentry/nextjs": "^10.44.0"
  },
  "dev": {
    "prisma": "^7.5.0"
  }
}
```

# Module graph report (Phase 2)

## After cuts — root vs storefront

[`src/app/layout.tsx`](../../src/app/layout.tsx) is **minimal**:

| Import | Client? | Notes |
|--------|---------|-------|
| `AuthProvider` | yes | universal session |
| `ConfirmProvider` | yes | small |
| `ScrollRestoration` / `CallbackUrlRedirect` | yes | light |
| `Toaster` (sonner) | yes | light |

Maps / Cart / Address / Navbar / Footer / address gates live only in [`(storefront)/layout.tsx`](../../src/app/(storefront)/layout.tsx) → [`StorefrontShell`](../../src/components/layout/StorefrontShell.tsx).

## Storefront client island (marketplace only)

| Import | Weight | Mitigation |
|--------|--------|------------|
| `GoogleMapsProvider` | `@googlemaps/js-api-loader` | Not on `/login` or portals |
| `CartProvider` | cart fetch | imports **`dalClient`** only |
| `AddressProvider` | maps-adjacent | storefront-only |
| `Navbar` | large | storefront-only; `dalClient` |
| `Footer` | small | storefront-only |
| `MandatoryAddressGate` | overlay + Maps | `dynamic({ ssr: false })` |
| `OutletCompletionBanner` | switcher hook | `dynamic({ ssr: false })` |

## Homepage (`(storefront)/page.tsx`)

Static: Hero, QuickActions, CompleteProfileBanner.  
Dynamic (below-fold): FeaturedDeals, vendor rollups, newsletter, collections, etc.

## Highest fan-in modules

| Module | Role | Risk after cuts |
|--------|------|-----------------|
| `@/lib/utils` | `cn` + formatters | High fan-in, low cost |
| `@/lib/dalClient` | cart + categories fetch | Thin; full `dal` off chrome path |
| `lucide-react` | icons | `optimizePackageImports` |
| `next-auth/react` | session | Root via AuthProvider only |

## Barrels

| Barrel | Scope |
|--------|-------|
| `admin/entity/index.ts` | Admin only — not on `/` |
| `ui/form/index.tsx` | Forms — not root |

Not the `/` bottleneck.

## What `/` does NOT compile

Proven by request smoke (no Maps/cart markers on `/login`, `/admin`, `/vendor/dashboard`):

- Admin portal chrome
- Vendor dashboard chrome
- Brand portal chrome
- Login/register shells (no Navbar/Maps)

Inverse pollution (Navbar on admin) is **fixed** by the route group.

## Shared pollution (resolved)

- Full `dal.ts` removed from Cart/Navbar → [`dalClient.ts`](../../src/lib/dalClient.ts).
- Prisma / pdfkit / bullmq remain server-only (phase-1 ESLint restrictions).

## Inventory

See [`use-client-inventory.md`](./use-client-inventory.md). Full app still ~330+ `"use client"` files; mega vendor/admin pages stay out of `/` unless imported.

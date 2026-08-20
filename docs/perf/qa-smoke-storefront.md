# Phase 2 QA smoke — storefront vs portal chrome

Date: 2026-08-20. Server: `next dev` on `:3020` (Turbopack, React Compiler off in dev).

Playwright MCP was **not available** in this agent session (no browser MCP tools registered). Smoke used HTTP + HTML/RSC marker checks.

## Results

| Route | Status | Storefront Maps/Cart | Storefront Footer | Notes |
|-------|-------:|----------------------|-------------------|-------|
| `/` | 200 | yes | yes | Homepage chrome present |
| `/cart` | 200 | yes (`StorefrontShell` / `AddressProvider`) | SSR text sparse | Under `(storefront)` |
| `/login` | 200 | **no** | **no** | Login form only |
| `/admin` | 200 | **no** | **no** | Unauthenticated → login shell (~31k) |
| `/vendor/dashboard` | 200 | **no** | **no** | Unauthenticated → login shell (~31k) |
| `/vendor` | 404 | — | — | Expected (no index page) |

## Pass criteria (plan)

- [x] `/` has marketplace chrome (Maps + cart graph)
- [x] `/login` has **no** marketplace Navbar/Maps/Cart
- [x] `/admin` and `/vendor/dashboard` do **not** pull storefront Maps/Cart
- [ ] Address gate with logged-in no-address user — needs session; defer to Playwright MCP exploratory QA

Deterministic promo/math/e2e suites unchanged.

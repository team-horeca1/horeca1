# Phase 2 conclusion — Turbopack graph profiling

## What was slow?

| Bucket | Pre-cut (Win) | After cuts (Win, compiler off in dev) | Δ |
|--------|--------------:|--------------------------------------:|--:|
| Spawn → Ready | 8.4s | 3.9–9s | similar |
| First `/` TTFB/body | **48.5s** | **2.5–3.8s** | **~92%** |
| Warm `/` | 0.38s | 0.15–0.35s | already fine |
| `/login` after `/` | 4.9s | 0.15–0.5s | **~90%** |

Evidence: `docs/perf/next-dev-bench-baseline.json`, `next-dev-bench-after-layout.json`, `next-dev-bench-compiler-off.json`, `docs/perf/_dev-run-*.log` (Next reports `compile:` separately from `render:`).

## Why was it slow?

1. **Root layout client megagraph** — Maps + Cart + Address + Navbar + address overlays compiled for every route including `/login` and portals.
2. **Homepage static client section imports** — large below-fold client graph on first `/`.
3. **React Compiler in development** — after layout slim, first `/` was still ~18s with compiler on vs ~3.8s with compiler off.
4. **Full `dal.ts` in Cart/Navbar** — unnecessary vendors/orders surface in chrome graph (mitigated via `dalClient.ts`).

Not primary: barrel files, unused deps (phase 1), CSS file size, Prisma in client.

## What we changed

1. Harness: `scripts/measure-next-dev-performance.mjs`
2. Slim root layout; `(storefront)` route group owns marketplace chrome
3. Dynamic deferred overlays + homepage below-fold sections
4. `dalClient` for cart + categories only
5. Inter weights 400/500/600 only
6. Sentry Replay disabled in development
7. `reactCompiler` production-only (force with `HORECA_REACT_COMPILER=1`)

## Is 1-second cold compile realistic?

**No** for this codebase on Windows (~102 pages, ~326 API routes, large storefront client graph). Proven floor after aggressive cuts: **~2.5–4s first `/`** with warm FS cache; cold Ready **~4–8s**. Chasing 1s cold would require multi-app splits or accepting incomplete storefront graphs — not justified by measurements.

## Daily workflow

```text
npm run dev:db
npm run dev:turbo          # host Turbopack, compiler off in dev
npm run perf:dev           # harness → docs/perf/next-dev-bench.json
```

Docker Linux may improve FS discovery further; graph cost remains the main lever (already cut).

## A/B details

See [`compiler-sentry-ab.md`](./compiler-sentry-ab.md).

## Browser QA

HTTP smoke recorded in [`qa-smoke-storefront.md`](./qa-smoke-storefront.md) (Playwright MCP not registered in this agent session):

- `/` has storefront Maps/Cart/Footer
- `/login` has **no** marketplace Maps/Cart/Footer
- `/admin` and `/vendor/dashboard` do **not** pull storefront chrome (unauth → login shell)
- Address gate with a logged-in no-address session: still for Playwright MCP exploratory QA

Deterministic promo/math/e2e suites unchanged.

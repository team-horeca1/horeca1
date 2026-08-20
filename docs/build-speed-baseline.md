# Build / Dev Speed Baseline & Report

**Machine:** Windows host · Next.js **16.1.6 (Turbopack)** · measured 2026-08-20  

## Baseline (before optimization)

| Metric | Value | Notes |
|--------|------:|-------|
| Cold compile | **100 s** | Turbopack `Creating an optimized production build` |
| Cold `runAfterProductionCompile` (Sentry) | **16.2 s** | With `widenClientFileUpload: true` |
| Cold static generation | **6.4 s** | 270 pages |
| Cold wall clock | **~155 s** | Ends in Windows standalone copy failure (below) |
| Warm compile | **100 s** | No FS-cache win observed for compile on this host |
| Warm Sentry post-step | **20.3 s** | |
| Direct dependencies | **30** | |
| Direct devDependencies | **18** | |
| Dev Ready | **13 s** | `npx next dev --port 3000` |
| First `/` | **61.7 s** | Cold route compile |
| First `/login` | **16.4 s** | |
| First `/checkout` | **0.8 s** | Warm graph |
| First `/admin/promotions` | **0.5 s** | |
| First `/vendor/products` | **0.4 s** | |
| Dev RSS (pid on :3000) | **~1384 MB** | After route hits |

### Windows standalone copy failure (unchanged)

Turbopack emits chunk filenames containing `node:inspector` (colon). Windows `copyfile` into `.next/standalone` fails with `EINVAL`. **Compile itself succeeds.** Linux CI/Docker builds are the production path. Do not use Webpack as a workaround for normal work — see [`docs/dev-speed.md`](./dev-speed.md).

---

## Changes applied

1. **`next.config.ts`**
   - Removed invalid `eslint` key (Next 16 warning).
   - `optimizePackageImports`: drop dead `react-icons`; add `recharts`.
   - FS polling only when `WATCHPACK_POLLING` / `CHOKIDAR_USEPOLLING` / `HORECA_DOCKER_DEV` (Docker already sets these; host `dev:turbo` uses native events).
   - Sentry: `widenClientFileUpload` + `sourcemaps.disable` are **CI-only** (local builds no longer need wide map upload).
2. **Dependencies removed (proven unused):** `framer-motion`, `swr`, `enhanced-resolve`, `@vitest/coverage-v8`.
3. **`@types/pdfkit`** moved to `devDependencies`.
4. **`tsconfig.json`** excludes `e2e/`; added `tsconfig.e2e.json` + `npm run typecheck` / `typecheck:e2e`.
5. **Admin dashboard:** recharts charts split into dynamically imported [`AdminDashboardCharts`](../src/components/features/admin/AdminDashboardCharts.tsx).
6. **ESLint:** `no-restricted-imports` for Prisma/pdfkit/bullmq/ioredis/fs under client UI paths (`components`, `context`, `hooks`, `app/**/*.tsx` except API).
7. **Docs:** [`docs/dev-speed.md`](./dev-speed.md), Playwright MCP in [`.mcp.json`](../.mcp.json), [`docs/browser-qa-agent.md`](./browser-qa-agent.md), Cursor skill `.cursor/skills/browser-qa-playwright-mcp/`.

---

## After optimization

| Metric | Value | Δ vs baseline |
|--------|------:|---------------|
| Cold compile | **88–92 s** | **~8–12% faster** |
| Direct dependencies | **26** | **−4 packages** |
| Direct devDependencies | **18** | 0 net (coverage removed, pdfkit types moved in) |
| `tsc --noEmit` | **pass** | |
| `npm run lint` | **0 errors** (warnings unchanged ~445) | |
| Promo math harness | **90 passed** | |
| Windows standalone finalize | still fails (colon path) | unchanged |
| Dev startup / first `/` | not re-timed after final Sentry tweak (prior Ready **13 s**, `/` **61.7 s**) | |

### Honest non-wins

- Warm compile was **not** dramatically faster than cold on this Windows host (Turbopack FS cache did not show a large second-build compile drop in our runs).
- Local Sentry `runAfterProductionCompile` still *starts*; CI keeps full sourcemap upload. Further local skip would require not wrapping with `withSentryConfig` outside CI (behavior change for local prod bundles — deferred).
- Mega client pages (vendor products ~4k lines) were **not** rewritten; deferred by plan.

---

## Summary percentages

```text
Build improvement (cold compile): ~8–12%
Dev startup improvement:          ~0% measured (already Turbopack; Ready ~13s)
Incremental compile improvement:  not re-measured (host native FS polling removed vs Docker)
Memory improvement:               not re-measured
Dependency reduction:             4 packages removed (+ 1 types package reclassified)
```

## How to work fast locally

1. `npm run dev:db` then `npm run dev:turbo` (or Docker `npm run dev`).
2. Never `dev:webpack` for e2e.
3. Deterministic tests: math harness + Playwright against standalone **on Linux/CI** or Turbopack `:3000`.
4. Exploratory QA: Playwright MCP — see [`docs/browser-qa-agent.md`](./browser-qa-agent.md).

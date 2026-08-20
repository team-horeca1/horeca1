# Compiler & Sentry A/B (Phase 2)

Environment: Windows host Turbopack, harness `scripts/measure-next-dev-performance.mjs`.

## React Compiler

| Config | First `/` body | Source |
|--------|---------------:|--------|
| On (default before change), fat root | ~48500 ms | `next-dev-bench-baseline.json` |
| On, after layout slim + homepage dynamics | ~18000 ms | `_dev-run-*.log` / after-layout bench |
| **Off in development** (`reactCompiler` only when `production` or `HORECA_REACT_COMPILER=1`) | **~2450–3800 ms** | `next-dev-bench-compiler-off.json` |

**Decision:** keep compiler **off in `development`**, **on for production builds**. Force local A/B with `HORECA_REACT_COMPILER=1`.

## Sentry Replay (client)

| Config | Change |
|--------|--------|
| Before | `replayIntegration()` + session/error sample rates in all envs |
| After | `integrations: []`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`, `tracesSampleRate: 0.05` when `NODE_ENV === 'development'` |

Measured as part of client graph diet alongside layout slim; not isolated as a solo harness row. Replay off removes a heavy client dependency from every page that loads `instrumentation-client.ts`.

## Server instrumentation

[`instrumentation.ts`](../../src/instrumentation.ts) event listeners remain gated for local turbo (opt-in) — verified unchanged / not registering heavy listeners by default in dev.

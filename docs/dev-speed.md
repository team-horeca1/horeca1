# Local Dev Speed Guide

## Prefer Turbopack (default)

| Command | Bundler | When to use |
|---------|---------|-------------|
| `npm run dev` | Turbopack (Docker) | Full stack with compose |
| `npm run dev:turbo` | Turbopack (host) | Fastest host HMR; DB/Redis via `npm run dev:db` |
| `npm run dev:webpack` | Webpack | **Emergency only** (rare bundler regressions) |

Next.js 16.1 already defaults `next dev` / `next build` to **Turbopack**. You do **not** need `--turbo`.

## Do not use Webpack for normal work or e2e

`next dev --webpack` cold-compiles routes for tens of seconds to minutes and was the main cause of slow local Playwright runs. Keep Playwright on:

1. `npm run build` (or CI/Linux image when Windows standalone copy fails — see `docs/build-speed-baseline.md`)
2. `node .next/standalone/server.js` on `:3000`
3. `PLAYWRIGHT_SKIP_WEBSERVER=1` + `PLAYWRIGHT_BASE_URL=http://localhost:3000`

## Docker FS polling

Compose sets `WATCHPACK_POLLING=true` so bind-mounts get HMR. Host `dev:turbo` does **not** force 1s polling — native FS events are used.

## Typecheck / lint

- `npx tsc --noEmit` and `npm run lint` run in CI and locally.
- `next build` skips the in-process typecheck (droplet OOM history). Do not re-enable it on the build path.

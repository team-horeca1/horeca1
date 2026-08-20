# First-request breakdown (Phase 2)

Measured on **Windows host** Turbopack via `scripts/measure-next-dev-performance.mjs`.

## Before architecture cuts

| Bucket | ms | Notes |
|--------|---:|-------|
| Process + Next init (spawn → Ready) | **8417** | |
| First `/` TTFB / body | **48502 / 48539** | Compile-dominated |
| Warm `/` body | **375** | |
| Control `/login` body | **4926** | Still paid root Maps/Cart/Navbar |

## After storefront isolation + homepage dynamics + compiler off in dev

| Bucket | ms | Notes |
|--------|---:|-------|
| Ready-in | **3900–8000** | |
| First `/` TTFB / body | **2454–3795** | **~92% vs baseline** |
| Warm `/` body | **157–343** | |
| Control `/login` body | **155–507** | No storefront chrome |

Next log sample (after layout, compiler still on): `compile: 16.5s`. With compiler off in dev: harness body **~3.8s**.

## Interpretation

- First `/` wall time ≈ **Turbopack compile of storefront graph**, not DB.
- Layout slim + dynamic sections + **dev React Compiler off** were the three largest wins.
- Hydration not separately timed (HTTP harness); use Playwright MCP for paint/hydration QA.

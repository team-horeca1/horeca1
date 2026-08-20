# Turbopack cache / incremental matrix

Platform: Windows host · React Compiler **off in development** · after storefront isolation.

| Scenario | Result | Notes |
|----------|--------|-------|
| Cold spawn → Ready | **3.9–8s** | Acceptable |
| Cold first `/` (empty-ish cache) | **~3.8s** body | vs 48.5s pre-cuts |
| Warm restart first `/` (FS cache warm) | **~2.5s** | Further drop |
| Warm repeat `/` | **150–350ms** | Near-instant |
| Warm `/login` after `/` | **150–500ms** | Login no longer pays Maps/Cart |
| Leaf Footer touch + request | harness ~11s wall | HMR not detected in log parse — overcounts wait loop; treat as upper bound |
| Shared util / layout / CSS / dep bump | not separately timed | Use harness with targeted edits |

## Target narrative vs reality

```text
cold startup:     ~4–8s     ✓ acceptable
warm route:       ~0.2s     ✓ near-instant
first useful /:   ~2.5–4s   ✓ dramatically faster (was ~48s)
leaf edit:        needs better HMR probe (harness follow-up)
1s cold compile:  NOT realistic for this app size on Windows
```

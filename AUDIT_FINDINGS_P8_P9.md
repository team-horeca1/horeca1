# AUDIT FINDINGS — Packs P8 / P9 (UX / A11y / Responsive / Performance)

**Date:** 2026-07-15  
**Base URL:** http://localhost:3000  
**Method:** Playwright P0 crawl responsive matrix + curl TTFB spot-checks + second-pass verification  
**No application code changes.**

---

## Summary

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High     | 0 |
| Medium   | 3 |
| Low      | 3 |

---

## Bugs

### UX-001 — Horizontal overflow on homepage across common viewports

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | P0 crawl recorded overflow at **320, 375, 390, 768, 1280** (`PLAYWRIGHT_QA_REPORT.md` P0-187–191) |
| **Expected** | `document.scrollWidth <= clientWidth` |
| **Actual** | Horizontal scroll present |
| **Hypothesis** | Wide hero/nav/flex children without `min-w-0` / overflow constraints |
| **Related** | Homepage / Navbar layout components |
| **Repro** | Verified via automated crawl |

### UX-002 — Primary nav “Offers” leads to under-construction

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | P1-006; nav Offers → `/under-construction` |
| **Expected** | Live feature or link hidden |
| **Actual** | Dead-end placeholder in primary chrome |
| **Category** | UX / first-time customer trust |

### UX-003 — Vendor portal first paint shows empty shell / “Loading active outlet…”

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | P2-004 / P2-006 — cold loads show empty body or outlet spinner for several seconds |
| **Expected** | Skeleton with clear loading state; content within ~2s on warm local |
| **Actual** | Looks broken until hydration completes |
| **Note** | Worse under concurrent load (see PERF-001 / P1-003) |

### A11Y-001 — Unnamed icon buttons (crawl)

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Evidence** | P0 crawl flagged unnamed `<button>` on multiple public pages (login, cart, search, etc.) |
| **Expected** | Every button has accessible name |
| **Suggested fix** | `aria-label` on icon-only controls |

### A11Y-002 — Images missing `alt` (crawl)

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Evidence** | P0 crawl Low/Medium image alt findings across marketplace pages |
| **Suggested fix** | Meaningful alt or `alt=""` for decorative |

### PERF-001 — API latency spikes under concurrent local load

| Field | Detail |
|-------|--------|
| **Severity** | Medium (escalates to High when store hangs — see P1-001/P1-003) |
| **Evidence** | Under parallel audit agents, APIs ~50s; store products 500/timeout |
| **Light-load recheck** | Home TTFB ~0.86s; search ~0.34s; cart page ~0.33s; cart API ~0.71s (**healthy**) |
| **Hypothesis** | Dev-server + Prisma pool contention under multi-agent load, not inherent cold-path slowness |
| **Confidence** | High that light path is OK; High that concurrent overload reproduces hangs |

---

## PASS checks

| ID | Check | Result |
|----|-------|--------|
| P8-PASS-01 | `/wishlist` → 404 | **PASS** (verified) |
| P8-PASS-02 | Logout → `/api/v1/auth/me` 401 | **PASS** (verified) |
| P8-PASS-03 | Light-load homepage/search/cart TTFB &lt; 2s | **PASS** |
| P9-PASS-01 | Health endpoint healthy during audit | **PASS** |
| P8-GAP | Full keyboard tab audit of all overlays | **Partial** — login keyboard not isolated this run (Playwright MCP timeout under load) |
| P8-GAP | Edge/Firefox/Safari matrix | **Not run** — Chromium only |
| P8-GAP | Contrast WCAG AA full audit | **Not run** — residual risk |

---

## Residual coverage gaps (P8/P9)

- Portrait/landscape on real devices  
- Full axe-core scan  
- Lighthouse CI budgets  
- Multi-browser visual diffs  

*End of P8/P9 findings.*

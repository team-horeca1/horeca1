# Promotions QA — Defect Log (Fix Phase)

**Date:** 2026-08-20  
**Commit base:** `8329d82` + local fixes  
**Env:** Turbopack `http://localhost:3000`, Edge MCP, Playwright Chromium e2e  

| ID | Severity | Role | Area | Reproduction | Root Cause | Fix | Regression Test | Status |
|----|----------|------|------|--------------|------------|-----|-----------------|--------|
| BUG-UI-001 | P2 | Guest | Navbar | Load `/` — hydration mismatch | Categories hydrated from cache in `useState` init | `useState([])` + cache in `useEffect` | Headed: 0 hydration errors | FIXED |
| BUG-UI-002 | P2 | Customer | Rewards invite | Invite showed `:3001` | AUTH_URL / wrong origin | Request Host + `invitePath` + client `origin` | e2e invite origin assert; dynamic accept | FIXED |
| BUG-UI-003 | P4 | Guest | Newsletter | `onGrocery` | Missing space before linebreak | `on{' '}` | Headed accessible name | FIXED |
| BUG-UX-001 | P2 | Customer | `/deals` cashback | Face value looked guaranteed | Badge used raw campaign value | `Up to …` + checkout note | Math badges; offers API; headed | FIXED |
| BUG-UI-004 | P1 | Admin/Vendor | Portal layout | `/admin/promotions` → error boundary | `useBusinessAccountSwitcher` → `useCart` without CartProvider | `useOptionalCart` | e2e admin/vendor campaign modal | FIXED |
| BUG-E2E-001 | P2 | QA | credentialsLogin | Failed to fetch / ECONNREFUSED `:3001` | In-page fetch + Auth.js 302 to AUTH_URL | APIRequestContext + `maxRedirects:0` + clearCookies | e2e subset + full | FIXED |
| BUG-PROG-001 | P1 | Customer | Welcome/referral on signup | Rewards empty after signup | `UserRegistered` sometimes 0 listeners (Turbopack) | Inline welcome + referral after emit in `auth.service` | e2e welcome + referral | FIXED |
| BLOCK-001 | — | Agent | MCP | Playwright missing | User MCP not loaded | `~/.cursor/mcp.json` msedge | — | CLOSED |
| BLOCK-002 | Blocker | Customer | Razorpay pay | Cannot headed pay→settle | External gateway | Deterministic settle tests only | Math settle suite | OPEN (env) |

---

## Notes

- Brand portal promotions: **not implemented** — not a defect.
- Shell/`npm run dev` may still export `AUTH_URL=http://localhost:3001` while `.env` says `:3000`. Align process env when starting the app.
- E2E leftovers deactivated via `scripts/promo-qa-deactivate-e2e-leftovers.mjs`.

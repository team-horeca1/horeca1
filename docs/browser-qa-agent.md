# Browser QA Agent (Playwright MCP)

Primary Cursor browser interface for **exploratory / manual-style QA**.  
Deterministic money/security coverage stays in:

- `e2e/*.spec.ts` (Playwright Chromium)
- `prisma/scripts/test-promo-math.ts`

Do **not** replace those with AI browsing.

## Setup

Project MCP lives in [`.cursor/mcp.json`](../.cursor/mcp.json) (Cursor reads this) and [`.mcp.json`](../.mcp.json) (repo copy). Playwright is registered as:

```json
"playwright": {
  "command": "npx.cmd",
  "args": ["-y", "@playwright/mcp@latest"]
}
```

`-y` is required so `npx` does not hang on an install prompt. On Windows use `npx.cmd`, not `npx`. Prefer `--browser msedge` when Google Chrome is not installed (Playwright’s default `chrome` channel needs admin to install).

Keep **one** Playwright MCP enabled. User-level `playwright` in `~/.cursor/mcp.json` is the working path. Leave project `playwright (horeca1-prod)` disabled so two browsers do not fight.

**If the agent says Playwright MCP is missing:** this Cursor session only has `user-*` servers (Hostinger/Supabase). Project servers are not loaded until you enable them:

1. Cursor Settings → MCP
2. Enable **playwright** (and **code-review-graph**) for this project
3. If it shows an error, click Restart / Reload
4. Start a **new Agent chat** (existing chats keep the old tool list)

Headed browser is the default — keep it headed for exploratory QA. Use headless only when you explicitly need unattended runs.

## Server to target

| Prefer | Avoid |
|--------|--------|
| Turbopack `npm run dev:turbo` on `:3000` | `npm run dev:webpack` |
| Standalone `node .next/standalone/server.js` (Linux/CI) | Cold webpack route compiles |

See [`docs/dev-speed.md`](./dev-speed.md).

## Auth reuse

- Prefer storage-state login once per role (`e2e/.auth/` is gitignored; same idea for MCP sessions).
- Keep one browser session alive during a QA session; do not re-login every scenario.
- Roles to cover independently: **customer**, **vendor**, **brand**, **admin**, **team/RBAC**.

## Interaction rules

1. Prefer **accessibility snapshots** for navigate / click / fill / select.
2. Avoid screenshot/vision loops unless a visual defect is the question.
3. No fixed `sleep()` — use auto-waiting / assertions.
4. UI-visible amounts are **not** authoritative for promo/wallet/cashback — cross-check network/API (and DB when needed).

## Exploratory checklist (per feature)

Happy path → boundaries (0/1/max/empty/long/special) → failures (invalid, expired session, missing permission, double-submit, back/refresh) → role/RBAC (direct URL + action) → console errors + failed network.

### Promo / financial focus

Price/discount/coupon/cashback/quantity/MOV/max-discount manipulation; expired/inactive; wrong vendor/store/user; duplicate/double-click redemption; race/replay; negative/decimal/rounding; settlement inconsistencies.

## Defect report template

```text
Severity: blocker | high | medium | low
Title:
Steps:
1.
2.
Expected:
Actual:
Evidence: console / network / API body
Role / URL:
```

## Example prompt

```text
Test the vendor promotion flow like a real QA engineer on http://localhost:3000.
Reuse auth if already logged in as vendor. Explore happy path, MOV edges,
and try forging discount amounts via the network panel. Report defects with
reproduction steps; do not stop after the first success.
```

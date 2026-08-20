---
name: browser-qa-playwright-mcp
description: >-
  Exploratory browser QA via Playwright MCP (accessibility snapshots, headed
  browser). Use when the user asks to manually test UI flows, promotions,
  RBAC, or find defects like a senior QA. Do not replace deterministic e2e
  or promo-math tests for financial/security assertions.
---

# Browser QA with Playwright MCP

## When this skill applies

User asks to test like a QA engineer, explore a flow, check RBAC, poke promotions/checkout, or find UI defects in a real browser from Cursor.

## Hard rules

- Use **Playwright MCP** only (project `.mcp.json`). Do not add Stagehand/Browserbase/Comet/agent-browser for the same job.
- Prefer **accessibility snapshots** over screenshots/vision.
- Target **Turbopack or standalone on :3000** — never webpack cold-compile for QA loops.
- Reuse authenticated sessions; do not login every scenario.
- For money/promo: never trust UI totals — verify API/network (and deterministic suites for hard assertions).
- Keep exploring after the first pass; report severity + reproduction steps.

## Roles

customer · vendor · brand · admin · team/RBAC — test independently; UI visibility ≠ authorization (try direct URLs).

## Defect output

Severity, title, steps, expected vs actual, console/network evidence, role/URL.

Full checklist: `docs/browser-qa-agent.md`.

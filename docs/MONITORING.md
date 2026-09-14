# Monitoring Strategy — Horeca1

## Current Stack

| Tool | Purpose | Tier | Status |
|------|---------|------|--------|
| **Sentry** | Error tracking, performance traces, session replay | Free (5K errors/mo) | Integrated |
| **Datadog** | Server infrastructure (CPU, RAM, disk, network) | Free (5 hosts) after 14-day trial | Install on droplet at deploy time |
| **DigitalOcean Monitoring** | Basic droplet metrics | Free (built-in) | Already available |

## What Each Tool Does

### Sentry — Application Monitoring

Sentry watches your **code**. It answers: *"What broke, where, and for whom?"*

- Catches every unhandled error (client + server + edge) with full stack trace
- Shows exact file, line number, and local variables when something crashes
- Session Replay records what the user was doing before the error happened
- Performance traces show slow API routes and page loads
- Alerts you on Slack/email when new errors appear

**When you'll use it:**
- A vendor says "I can't save my product" → Sentry shows the exact API error + request payload
- Checkout fails for a customer → Sentry shows the stack trace + session replay of what they did
- A new deploy introduces a regression → Sentry shows new errors spiking after deploy

**Dashboard:** https://horeca1.sentry.io

### Datadog — Infrastructure Monitoring

Datadog watches your **server**. It answers: *"Is the server healthy?"*

- CPU usage, memory consumption, disk space, network I/O
- Alerts when CPU stays above 90% for 5 minutes
- Alerts when disk is 85%+ full (PostgreSQL can crash if disk fills up)
- Shows trends over time so you can plan when to upgrade the droplet

**When you'll use it:**
- Site feels slow but Sentry shows no errors → Datadog reveals CPU at 95% from a runaway query
- PostgreSQL crashes overnight → Datadog shows disk hit 100% at 3am
- Planning capacity → Datadog shows RAM usage trending up 5% per week

**Dashboard:** https://us5.datadoghq.com

## When to Check Which Tool

| Situation | Check |
|-----------|-------|
| User reports a bug or crash | **Sentry** first |
| Site is slow for everyone | **Datadog** (server resources) then **Sentry** (slow traces) |
| Site is completely down | **Datadog** (is server alive?) |
| After a new deploy | **Sentry** (new errors?) |
| Weekly health check | **Datadog** (resource trends) |
| Debugging a specific user's issue | **Sentry** (session replay + error trail) |
| Database connection errors | **Sentry** (error logs) + **Datadog** (memory/CPU pressure) |

## What Each Tool Does NOT Do

| Tool | Does NOT cover |
|------|---------------|
| **Sentry** | Server CPU/memory, disk space, network bandwidth, uptime checks |
| **Datadog (free)** | Application errors, stack traces, user sessions, APM traces, logs |

They complement each other — Sentry is your eyes inside the app, Datadog is your eyes on the machine.

## Free Tier Limits

### Sentry (Free — Developer Plan)
- 5,000 errors/month
- 10K performance transactions/month
- 500 session replays/month
- 1 user
- 30-day data retention

**When to upgrade:** When you consistently hit 5K errors/month (means you have real traffic and should invest in monitoring). Plans start at $26/month.

### Datadog (Free — after 14-day trial)
- Infrastructure monitoring for up to 5 hosts
- 1-day metric retention (vs 15 months on paid)
- 100 custom metrics
- No APM, no logs, no synthetics

**When to upgrade:** When you add more servers or need APM/logs. Starts at $15/host/month. For a single droplet, the free tier is sufficient.

## Setup Reference

### Sentry (Already Integrated)

Config files in the codebase:
- `src/instrumentation-client.ts` — Browser SDK
- `sentry.server.config.ts` — Node.js server SDK
- `sentry.edge.config.ts` — Edge/middleware SDK
- `src/instrumentation.ts` — Runtime loader + request error capture
- `src/app/global-error.tsx` — React error boundary
- `next.config.ts` — Wrapped with `withSentryConfig()`, tunnel at `/monitoring`

Env vars:
- `.env.local` → `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`
- `.env.sentry-build-plugin` → `SENTRY_AUTH_TOKEN` (for source map uploads)

### Datadog (Install on Deploy)

Run on your DigitalOcean droplet:
```bash
DD_API_KEY=c93a4fcb56adcba285bde053782f85c5 \
DD_SITE="us5.datadoghq.com" \
DD_ENV=prod \
bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"
```

The agent runs as a background service (~60MB RAM) and reports to your Datadog dashboard automatically.

## Future: When to Add More

| Milestone | Add |
|-----------|-----|
| 10+ daily active vendors | UptimeRobot (free) for uptime pings |
| Multiple servers | Datadog paid or Grafana + Prometheus (self-hosted, free) |
| Need log search | Grafana Loki (self-hosted) or Datadog Logs (paid) |
| Need alerting on business metrics | Sentry Alerts (free) + Datadog Monitors (free tier has 2) |

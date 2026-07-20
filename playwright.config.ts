import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

/**
 * Local speed tips:
 * 1. Slow compiles come from `next dev`, not Playwright. Build once, then:
 *      npm run build
 *      # after build: copy static assets into standalone (required on Windows)
 *      Copy-Item -Recurse -Force .next\static\* .next\standalone\.next\static\
 *      Copy-Item -Recurse -Force public\* .next\standalone\public\
 *      # terminal A — local Docker DB/Redis + standalone
 *      $env:DATABASE_URL='postgresql://horeca1:horeca1_dev@127.0.0.1:5432/horeca1?schema=public'
 *      $env:REDIS_URL='redis://127.0.0.1:6379'
 *      $env:AUTH_URL='http://localhost:3000'
 *      node .next/standalone/server.js
 *      # terminal B
 *      $env:PLAYWRIGHT_SKIP_WEBSERVER=1; npm run test:e2e:foundation
 * 2. Avoid waitUntil:'networkidle' (Next keeps sockets open).
 * 3. output:'standalone' — use `node .next/standalone/server.js`, not `next start`.
 * 4. proxy.ts must use secureCookie based on request protocol (https only),
 *    otherwise production builds on http://localhost 307 every portal route.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : Math.min(4, os.cpus().length),
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_WEB_COMMAND
          ?? 'node .next/standalone/server.js',
        cwd: process.env.PLAYWRIGHT_WEB_CWD ?? '.next/standalone',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          ...process.env,
          PORT: '3000',
          HOSTNAME: '0.0.0.0',
          DATABASE_URL:
            process.env.DATABASE_URL
            ?? 'postgresql://horeca1:horeca1_dev@127.0.0.1:5432/horeca1?schema=public',
          REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
          AUTH_URL: process.env.AUTH_URL ?? baseURL,
          AUTH_SECRET: process.env.AUTH_SECRET ?? 'horeca1-dev-secret-change-in-prod-32chars',
        },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

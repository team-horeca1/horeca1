import { type Page, type Browser, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.join(process.cwd(), 'e2e', '.auth');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export function authStatePath(role: 'admin' | 'vendor'): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

async function sessionEmail(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const json = await res.json();
      return (json?.user?.email as string | undefined) ?? null;
    });
  } catch {
    // Post-login hard redirect can destroy the execution context mid-poll.
    return null;
  }
}

/**
 * Auth.js credentials callback — bypasses login UI overlays (location picker, etc.).
 * Prefer this for prod E2E account switches.
 *
 * Uses the Playwright APIRequestContext (cookie jar shared with the page) instead of
 * in-page fetch — Turbopack login pages often throw "Failed to fetch" mid-compile.
 */
export async function credentialsLogin(page: Page, email: string, password: string) {
  const origin = BASE_URL.replace(/\/$/, '');
  // Stale session/callback cookies (esp. AUTH_URL port mismatch) break the next login.
  await page.context().clearCookies();
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const api = page.context().request;
  let lastStatus = 0;
  let lastHint = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let status = 0;
    let url = '';
    try {
      const csrfRes = await api.get(`${origin}/api/auth/csrf`);
      if (!csrfRes.ok()) {
        lastStatus = csrfRes.status();
        lastHint = `csrf ${csrfRes.status()}`;
        await page.waitForTimeout(500 * (attempt + 1));
        await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
        continue;
      }
      const csrf = (await csrfRes.json()) as { csrfToken?: string };
      if (!csrf.csrfToken) {
        lastHint = 'missing csrfToken';
        await page.waitForTimeout(500 * (attempt + 1));
        continue;
      }
      // Do NOT follow redirects: AUTH_URL may still point at an old port (e.g. :3001)
      // while the app under test is on PLAYWRIGHT_BASE_URL (:3000). Session cookies are
      // set on the 302; following Location would ECONNREFUSED the wrong host.
      const res = await api.post(`${origin}/api/auth/callback/credentials?`, {
        form: {
          csrfToken: csrf.csrfToken,
          callbackUrl: `${origin}/`,
          json: 'true',
          email,
          password,
        },
        maxRedirects: 0,
      });
      status = res.status();
      url = res.headers()['location'] || res.url();
    } catch (err) {
      lastHint = err instanceof Error ? err.message : String(err);
      await page.waitForTimeout(500 * (attempt + 1));
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
      continue;
    }
    lastStatus = status;
    lastHint = url;
    if (status === 429) {
      await page.waitForTimeout(Math.min(20_000 * (attempt + 1), 60_000));
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
      continue;
    }
    if (/error=CredentialsSignin/i.test(url)) {
      await page.waitForTimeout(1_000 * (attempt + 1));
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
      continue;
    }
    if (status >= 400) {
      throw new Error(`Credentials login failed (${status}) for ${email}: ${lastHint}`);
    }
    // Ensure the browser document picks up cookies from the shared jar.
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
    try {
      await expect
        .poll(async () => Boolean(await sessionEmail(page)), {
          timeout: 15_000,
          intervals: [100, 250, 500, 1000],
        })
        .toBe(true);
      return;
    } catch {
      await page.waitForTimeout(1_000 * (attempt + 1));
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
    }
  }
  throw new Error(
    `Credentials login failed (${lastStatus || 'no session'}) for ${email}: ${lastHint}`,
  );
}

/** Prefer domcontentloaded — networkidle is very slow on Next.js. */
export async function passwordLogin(page: Page, email: string, password: string) {
  // Prefer API callback — UI path is flaky when location/nav overlays intercept clicks.
  try {
    await credentialsLogin(page, email, password);
    return;
  } catch {
    /* fall through to UI */
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // Dismiss overlays that block the login form (location / empty address book)
    const closeLoc = page.getByRole('button', { name: /Close delivery location|Close/i }).filter({
      has: page.locator('svg'),
    }).or(page.getByRole('button', { name: /Close delivery location/i })).first();
    if (await closeLoc.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeLoc.click({ force: true }).catch(() => {});
    }
    const deliveryHeading = page.getByRole('heading', { name: /Delivery Location|Choose Delivery Location/i });
    if (await deliveryHeading.isVisible({ timeout: 400 }).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      const xBtn = page.locator('.fixed.inset-0 button, [class*="z-[11001]"] button').filter({
        has: page.locator('svg'),
      }).first();
      await xBtn.click({ force: true }).catch(() => {});
    }
    for (const name of [
      /Go Without Location/i,
      /Skip for now/i,
      /Maybe later/i,
      /^Cancel$/i,
    ]) {
      const btn = page.getByRole('button', { name }).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    // Account / business pickers — DO NOT match /Select/ (hits "Select Location" in navbar)
    const continueBtn = page.getByRole('button', { name: /^(Continue|Continue as)/i }).first();
    if (await continueBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await continueBtn.click({ force: true }).catch(() => {});
    }

    const pwField = page.getByPlaceholder('Enter password');
    if (!(await pwField.isVisible().catch(() => false))) {
      const switcher = page.getByRole('button', { name: /Sign in with password|Have a password/i });
      await switcher.waitFor({ state: 'visible', timeout: 15_000 });
      await switcher.click({ force: true });
      await pwField.waitFor({ state: 'visible', timeout: 10_000 });
    }

    await page.getByPlaceholder(/Phone or email/i).fill(email);
    await pwField.fill(password);

    const callback = page.waitForResponse(
      (r) => r.url().includes('/api/auth/callback/') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    const cb = await callback.catch(() => null);
    if (!cb || cb.status() >= 400) {
      await page.waitForTimeout(300);
      continue;
    }

    // Do not wait for leaving /login — Auth.js may keep the URL while the
    // client hard-redirects asynchronously (admin JWTs are often chunked).
    try {
      await expect
        .poll(async () => Boolean(await sessionEmail(page)), {
          timeout: 15_000,
          intervals: [100, 250, 500, 1000],
        })
        .toBe(true);
    } catch {
      continue;
    }

    // Land on a stable page so later page.evaluate() isn't racing the login
    // hard-redirect. Session was already confirmed above — homepage may briefly
    // race account-picker / location overlays, so don't re-require session here.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(200);
    return;
  }
  throw new Error(`Password login failed for ${email}`);
}

/** One-time login saved to storageState — reused by dependent projects. */
export async function ensureAuthState(
  browser: Browser,
  role: 'admin' | 'vendor',
  email: string,
  password: string,
) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const file = authStatePath(role);
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await passwordLogin(page, email, password);
  expect(await sessionEmail(page)).toBeTruthy();
  await context.storageState({ path: file });
  await context.close();
  return file;
}

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
 */
export async function credentialsLogin(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  let lastStatus = 0;
  let lastHint = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const status = await page.evaluate(
      async (payload) => {
        const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
        const csrf = await csrfRes.json();
        const body = new URLSearchParams();
        body.set('csrfToken', csrf.csrfToken);
        body.set('callbackUrl', '/');
        body.set('json', 'true');
        body.set('email', payload.email);
        body.set('password', payload.password);
        const res = await fetch('/api/auth/callback/credentials?', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          credentials: 'include',
          redirect: 'follow',
        });
        // Follow redirects so Set-Cookie from the callback is applied; opaque
        // redirect:manual often reports status 0 in Chromium.
        return { status: res.status, url: res.url, text: '' };
      },
      { email, password },
    );
    lastStatus = status.status;
    lastHint = status.text || status.url;
    if (status.status === 429 || /error=CredentialsSignin/i.test(status.url)) {
      // Prod auth rate limiter / brief auth lockout
      await page.waitForTimeout(Math.min(20_000 * (attempt + 1), 60_000));
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      continue;
    }
    if (status.status >= 400) {
      throw new Error(`Credentials login failed (${status.status}) for ${email}: ${lastHint}`);
    }
    try {
      await expect
        .poll(async () => Boolean(await sessionEmail(page)), {
          timeout: 12_000,
          intervals: [100, 250, 500, 1000],
        })
        .toBe(true);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      return;
    } catch {
      // Auth.js often returns 200 with an error URL when credentials are wrong / CSRF stale
      await page.waitForTimeout(1_000 * (attempt + 1));
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
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
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
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

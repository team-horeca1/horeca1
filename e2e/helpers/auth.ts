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

/** Prefer domcontentloaded — networkidle is very slow on Next.js. */
export async function passwordLogin(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    // Dismiss location picker if it covers the form
    const skipLoc = page.getByRole('button', { name: /Go Without Location/i });
    if (await skipLoc.isVisible().catch(() => false)) {
      await skipLoc.click().catch(() => {});
    }

    const pwField = page.getByPlaceholder('Enter password');
    if (!(await pwField.isVisible().catch(() => false))) {
      const switcher = page.getByRole('button', { name: /Sign in with password|Have a password/i });
      await switcher.waitFor({ state: 'visible', timeout: 15_000 });
      await switcher.click();
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

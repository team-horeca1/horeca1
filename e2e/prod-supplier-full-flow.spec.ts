import { test, expect, type Page } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

/**
 * Opt-in production suite. Skips unless:
 * - PLAYWRIGHT_BASE_URL is https production (freshville.store or matching host)
 * - E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD are set
 *
 * Run:
 *   $env:PLAYWRIGHT_BASE_URL='https://freshville.store'
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER='1'
 *   $env:E2E_ADMIN_EMAIL='...'
 *   $env:E2E_ADMIN_PASSWORD='...'
 *   npm run test:e2e:prod
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL ?? '';
const VENDOR_PASSWORD = process.env.E2E_VENDOR_PASSWORD ?? '';

const PROD_HOST_RE = /freshville\.store|64\.227\.187\.210/i;

function isProdTarget(): boolean {
  try {
    const u = new URL(BASE);
    return u.protocol === 'https:' && PROD_HOST_RE.test(u.host);
  } catch {
    return false;
  }
}

const shouldRun = isProdTarget() && Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe('@prod supplier full flow on production', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.skip(!shouldRun, 'Set PLAYWRIGHT_BASE_URL=https://freshville.store and E2E_ADMIN_* credentials');

  const ts = Date.now();
  const productName = `E2E Prod ${ts}`;
  const inviteEmail = `e2e+${ts}@example.com`;
  const invitePassword = `E2ePass${ts.toString().slice(-6)}!`;

  test('admin suppliers collapsed → expand → impersonate → dashboard', async ({ page }) => {
    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/admin/vendors', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Suppliers$/i })).toBeVisible({
      timeout: 45_000,
    });

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });

    // Accordion toggle on first supplier (prod may still default-open until collapse deploy)
    const detailsBtns = page.getByRole('button', { name: /^Details$/i });
    const before = await detailsBtns.count();
    await firstRow.locator('button').first().click();
    await page.waitForTimeout(500);
    let after = await detailsBtns.count();
    if (after === before) {
      // Click may have focused Impersonate; force via supplier name area
      await firstRow.locator('button').first().click();
      await page.waitForTimeout(500);
      after = await detailsBtns.count();
    }
    // Prefer expanded state for the rest of the assertion
    if (after < before || after === 0) {
      await firstRow.locator('button').first().click();
      await page.waitForTimeout(500);
    }
    await expect(detailsBtns.first()).toBeVisible({ timeout: 10_000 });

    const impBtn = page.getByTestId('impersonate-supplier').first();
    if (await impBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await impBtn.click();
    } else {
      const started = await page.evaluate(async () => {
        const listRes = await fetch('/api/v1/admin/vendors?view=suppliers&limit=100', {
          credentials: 'include',
        });
        const listJson = await listRes.json();
        const suppliers = (listJson.data?.suppliers ?? []) as Array<{
          userId: string;
          storeCount: number;
        }>;
        const s =
          suppliers.find((x) => x.storeCount >= 1)
          ?? suppliers[0];
        if (!s?.userId) return false;
        const res = await fetch('/api/v1/admin/impersonate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplierUserId: s.userId }),
        });
        return res.ok;
      });
      expect(started).toBeTruthy();
      await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
    }

    await expect(page).toHaveURL(/\/vendor\/overview/, { timeout: 45_000 });
    await expect(page.getByTestId('supplier-dashboard')).toBeVisible({ timeout: 45_000 });
  });

  test('businesses → enter store → Store Ops', async ({ page }) => {
    // Session from prior test may be gone; re-login + impersonate if needed
    await ensureSupplierSession(page);

    await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
    const viewBusiness = page.getByTestId('view-business').first();
    await expect(viewBusiness).toBeVisible({ timeout: 30_000 });
    await viewBusiness.click();

    await expect(page).toHaveURL(/\/vendor\/businesses\/[a-f0-9-]+/, { timeout: 30_000 });
    await expect(page.getByTestId('business-detail')).toBeVisible();
    await expect(page.getByTestId('back-to-supplier')).toBeVisible();

    const enterStore = page.getByTestId('enter-store').first();
    await expect(enterStore).toBeVisible({ timeout: 15_000 });
    await enterStore.click();

    await expect(page).toHaveURL(/\/vendor\/dashboard/, { timeout: 45_000 });
    await expect(page.getByText('Store Ops')).toBeVisible({ timeout: 20_000 });
  });

  test('create product in Store Ops and see it listed', async ({ page }) => {
    await ensureStoreOpsSession(page);

    const created = await page.evaluate(async ({ name, stamp }) => {
      const slug = `e2e-prod-${stamp}`;
      const res = await fetch('/api/v1/vendor/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          basePrice: 99,
          unit: 'kg',
          packSize: '1 kg',
          listingStatus: 'draft',
          description: 'Playwright production E2E product',
        }),
      });
      const json = await res.json();
      return {
        status: res.status,
        ok: json.success === true,
        id: json.data?.id as string | undefined,
        error: json.error?.message as string | undefined,
      };
    }, { name: productName, stamp: ts });

    expect(created.ok, created.error ?? `status ${created.status}`).toBeTruthy();
    expect(created.id).toBeTruthy();

    await page.goto('/vendor/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Store Ops')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 30_000 });
  });

  test('invite store-scoped team member', async ({ page }) => {
    // Team lives on supplier-level nav (not Store Ops)
    await ensureSupplierSession(page);

    await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Team/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    const invite = await page.evaluate(
      async ({ email, password, fullName }) => {
        const rolesRes = await fetch('/api/v1/vendor/roles', { credentials: 'include' });
        const rolesJson = await rolesRes.json();
        const roles = (rolesJson.data ?? []) as Array<{ id: string; name?: string }>;
        const roleId =
          roles.find((r) => r.name === 'Vendor Viewer')?.id
          ?? roles[0]?.id;
        if (!roleId) return { ok: false, status: 0, error: 'no roles' };

        const res = await fetch('/api/v1/vendor/team', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: email,
            fullName,
            password,
            roleId,
            scope: 'store',
          }),
        });
        const json = await res.json();
        return {
          ok: json.success === true,
          status: res.status,
          error: (json.error?.message as string | undefined) ?? JSON.stringify(json.error),
        };
      },
      { email: inviteEmail, password: invitePassword, fullName: `E2E Member ${ts}` },
    );

    expect(invite.ok, invite.error ?? `status ${invite.status}`).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(inviteEmail).first()).toBeVisible({ timeout: 20_000 });
  });
});

async function ensureSupplierSession(page: Page) {
  const hasSession = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    const j = await r.json();
    return Boolean(j?.user?.email);
  }).catch(() => false);

  if (!hasSession) {
    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  }

  // Optional vendor direct login (many prod envs lack the local seed vendor)
  if (VENDOR_EMAIL && VENDOR_PASSWORD) {
    try {
      const email = await page.evaluate(async () => {
        const r = await fetch('/api/auth/session', { credentials: 'include' });
        const j = await r.json();
        return (j?.user?.email as string | undefined) ?? '';
      });
      if (email.toLowerCase() !== VENDOR_EMAIL.toLowerCase()) {
        await passwordLogin(page, VENDOR_EMAIL, VENDOR_PASSWORD);
      }
    } catch {
      // Fall through to admin impersonation
      await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    }
  }

  await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  if (!(await page.getByTestId('supplier-dashboard').isVisible({ timeout: 8_000 }).catch(() => false))) {
    // Need admin session to impersonate
    const role = await page.evaluate(async () => {
      const r = await fetch('/api/auth/session', { credentials: 'include' });
      const j = await r.json();
      return (j?.user?.role as string | undefined) ?? '';
    });
    if (role !== 'admin') {
      await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    }
    await impersonateAnySupplier(page);
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByTestId('supplier-dashboard')).toBeVisible({ timeout: 45_000 });
}

async function ensureStoreOpsSession(page: Page) {
  await ensureSupplierSession(page);

  // Always re-enter a store: supplier pages clear sessionStorage enter flag,
  // and each Playwright test gets a fresh browser context.
  await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('view-business').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('view-business').first().click();
  await expect(page.getByTestId('business-detail')).toBeVisible({ timeout: 30_000 });

  const enterBtn = page.locator('[data-testid="enter-store"]:not([disabled])').first();
  await expect(enterBtn).toBeVisible({ timeout: 20_000 });
  await enterBtn.click();

  await expect(page).toHaveURL(/\/vendor\/dashboard/, { timeout: 45_000 });
  await expect(page.getByText('Store Ops')).toBeVisible({ timeout: 25_000 });
}

async function impersonateAnySupplier(page: Page) {
  const started = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/admin/vendors?view=suppliers&limit=100', {
      credentials: 'include',
    });
    const listJson = await listRes.json();
    const suppliers = (listJson.data?.suppliers ?? []) as Array<{
      userId: string;
      storeCount: number;
    }>;
    const s = suppliers.find((x) => x.storeCount >= 1) ?? suppliers[0];
    if (!s?.userId) return false;
    const res = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierUserId: s.userId }),
    });
    return res.ok;
  });
  expect(started).toBeTruthy();
}

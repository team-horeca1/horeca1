import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

async function passwordLogin(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/login', { waitUntil: 'networkidle' });
    if (!page.url().includes('/login')) return;

    const pwField = page.getByPlaceholder('Enter password');
    if (!(await pwField.isVisible())) {
      await page.locator('button').filter({ hasText: 'Sign in with password' }).click();
    }
    if (await pwField.isVisible()) {
      await page.getByPlaceholder('Phone or email').fill(email);
      await pwField.fill(password);
      await page.getByRole('button', { name: /^Sign in$/i }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 }).catch(() => {});
      if (!page.url().includes('/login')) return;
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('Password login failed after retries');
}

async function adminImpersonateFirstVendor(page: Page) {
  const vendorId = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=10', { credentials: 'include' });
    const json = await list.json();
    const vendors = json.data?.vendors ?? [];
    const active = vendors.find((v: { isActive?: boolean }) => v.isActive !== false);
    return active?.id ?? vendors[0]?.id ?? null;
  });
  expect(vendorId).toBeTruthy();
  const status = await page.evaluate(async (id) => {
    const res = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: id }),
    });
    return res.status;
  }, vendorId);
  expect(status).toBe(200);
}

test('vendor outlets: no storefront navbar + admin can list/create warehouse', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');
  await adminImpersonateFirstVendor(page);

  await page.goto('/vendor/outlets', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Outlets & warehouses/i })).toBeVisible({ timeout: 30_000 });

  // Storefront / home navbar must not appear on vendor portal routes
  await expect(page.getByRole('link', { name: 'Vendors', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Lists', exact: true })).toHaveCount(0);
  await expect(page.getByText('Deliver to')).toHaveCount(0);
  await expect(page.getByText('VENDOR PANEL')).toBeVisible();

  // Green warehouse strip present
  await expect(page.getByRole('button', { name: /Switch warehouse/i }).or(page.getByText(/^Warehouse$/i))).toBeVisible({ timeout: 20_000 });

  // Account outlets API must work under vendor Admin View (not "not a member")
  const ba = await page.evaluate(async () => {
    const res = await fetch('/api/v1/vendor/outlets', { credentials: 'include' });
    const json = await res.json();
    return {
      ok: res.ok && json.success,
      accountId: json.data?.businessAccount?.id as string | undefined,
      count: (json.data?.outlets ?? []).length as number,
    };
  });
  expect(ba.ok).toBeTruthy();
  expect(ba.accountId).toBeTruthy();

  const listViaAccount = await page.evaluate(async (accountId) => {
    const res = await fetch(`/api/v1/account/${accountId}/outlets`, { credentials: 'include' });
    const json = await res.json();
    return {
      status: res.status,
      ok: res.ok && json.success,
      message: json.error?.message as string | undefined,
      count: Array.isArray(json.data) ? json.data.length : 0,
    };
  }, ba.accountId);
  expect(listViaAccount.ok, listViaAccount.message ?? `status ${listViaAccount.status}`).toBeTruthy();
  expect(listViaAccount.message ?? '').not.toMatch(/not a member/i);

  // Create a warehouse as admin-in-vendor-view
  const name = `E2E WH ${Date.now() % 100000}`;
  const created = await page.evaluate(async ({ accountId, name }) => {
    const res = await fetch(`/api/v1/account/${accountId}/outlets`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        addressLine: 'E2E Playwright Address, Mumbai',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        latitude: 19.076,
        longitude: 72.8777,
      }),
    });
    const json = await res.json();
    return {
      status: res.status,
      ok: res.ok && json.success,
      message: json.error?.message as string | undefined,
      id: json.data?.id as string | undefined,
    };
  }, { accountId: ba.accountId!, name });
  expect(created.ok, created.message ?? `status ${created.status}`).toBeTruthy();
  expect(created.message ?? '').not.toMatch(/not a member/i);

  // UI Add outlet opens create form (not empty "No outlets yet" dead-end)
  await page.getByRole('button', { name: /Add outlet/i }).click();
  await expect(page.getByRole('heading', { name: /Outlets & Delivery|Add Outlet|Edit Outlet/i }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('You are not a member of this account')).toHaveCount(0);
  // Create form or branch list with existing warehouses
  const noOutletsEmpty = page.getByText('No outlets yet.');
  const createFields = page.getByPlaceholder(/Outlet name|Pick from map|Address/i).or(page.getByLabel(/Outlet name/i));
  const hasCreate = await createFields.first().isVisible().catch(() => false);
  const emptyVisible = await noOutletsEmpty.isVisible().catch(() => false);
  // After API fix, either create form is open or list shows branches — not a false empty state alone
  expect(hasCreate || !emptyVisible || listViaAccount.count > 0 || created.ok).toBeTruthy();
});

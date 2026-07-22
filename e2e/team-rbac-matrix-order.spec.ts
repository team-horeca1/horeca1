import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

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
  // Re-confirm admin session — prior tests may leave cookies in a weird state.
  const role = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    const j = await r.json();
    return (j?.user?.role as string | undefined) ?? '';
  });
  if (role !== 'admin') {
    await passwordLogin(page, 'admin@horeca1.com', 'admin123');
  }

  const vendorId = await page.evaluate(async () => {
    const flat = await fetch('/api/v1/admin/vendors?limit=20', { credentials: 'include' });
    const flatJson = await flat.json();
    const vendors = (flatJson.data?.vendors ?? []) as Array<{ id?: string; isActive?: boolean }>;
    const active = vendors.find((v) => v.isActive !== false && v.id);
    if (active?.id) return active.id;
    if (vendors[0]?.id) return vendors[0].id;

    // Fallback: suppliers hierarchy embeds Online Store ids
    const hier = await fetch('/api/v1/admin/vendors?view=suppliers&limit=20', { credentials: 'include' });
    const hierJson = await hier.json();
    const suppliers = (hierJson.data?.suppliers ?? []) as Array<{
      businesses?: Array<{ stores?: Array<{ id?: string }> }>;
    }>;
    for (const s of suppliers) {
      for (const b of s.businesses ?? []) {
        const sid = b.stores?.[0]?.id;
        if (sid) return sid;
      }
    }
    return null;
  });
  expect(vendorId, 'admin vendors list returned no vendor id').toBeTruthy();
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

async function openRoleEditorMatrix(page: Page, teamPath: string) {
  await page.goto(teamPath, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Manage Roles' }).click();
  await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Duplicate' }).first().click();
  await expect(page.getByText('Permissions Matrix')).toBeVisible({ timeout: 20_000 });
}

function matrixGroupHeaders(page: Page) {
  return page.locator('tbody tr td[colspan]').filter({
    hasText: /Operations|Catalog|Customers|Finance|Account|Platform|Marketplace|Credit|Storefront|Portal/,
  });
}

test('RBAC matrix sidebar order — vendor + admin + storefront placement', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');
  await adminImpersonateFirstVendor(page);
  await openRoleEditorMatrix(page, '/vendor/team');

  const vendorGroups = matrixGroupHeaders(page);
  await expect(vendorGroups.nth(0)).toHaveText('Operations');
  await expect(vendorGroups.nth(1)).toHaveText('Catalog');
  await expect(vendorGroups.nth(2)).toHaveText('Customers');
  await expect(vendorGroups.nth(3)).toHaveText('Finance');
  await expect(vendorGroups.nth(4)).toHaveText('Account');
  await expect(page.getByRole('row', { name: /^Warehouse\b/i })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Sales Team/i })).toHaveCount(0);
  await expect(page.locator('table tbody td').filter({ hasText: /^GRN$/ })).toHaveCount(0);

  const moduleRows = page.locator('tbody tr').filter({ has: page.locator('td').first() }).filter({
    hasNot: page.locator('td[colspan]'),
  });
  await expect(moduleRows.first().locator('td').first()).toHaveText('Dashboard');
  await expect(page.getByRole('row', { name: /Wallet & Ledger/i })).toBeVisible();
  await expect(page.locator('table tbody td').filter({ hasText: /^Payments$/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Repeat Orders/i })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Add Member/i }).click();
  await page.getByPlaceholder('e.g. teammate@company.com or 9876543210').fill(
    `e2e-matrix-${Date.now()}@example.com`,
  );
  await page.getByPlaceholder('e.g. Rahul Sharma').fill('Matrix Test User');
  await page.locator('[data-field="password"] input').fill('matrix123');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText(/Step 2 of 3/i)).toBeVisible({ timeout: 20_000 });
  // Wait for supplier businesses/stores to finish loading before advancing
  await expect(page.getByText(/All stores/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText(/Step 3 of 3/i)).toBeVisible({ timeout: 20_000 });

  const storefrontHeading = page.getByText('Storefront Access');
  const permissionsTable = page.locator('table').filter({ hasText: 'Module' }).first();
  await expect(storefrontHeading).toBeVisible();
  const tableBox = await permissionsTable.boundingBox();
  const sfBox = await storefrontHeading.boundingBox();
  expect(tableBox).not.toBeNull();
  expect(sfBox).not.toBeNull();
  if (tableBox && sfBox) {
    expect(sfBox.y).toBeGreaterThan(tableBox.y + tableBox.height - 20);
  }

  await expect(page.getByRole('row', { name: /Repeat Orders/i })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.evaluate(() => fetch('/api/v1/admin/impersonate', { method: 'DELETE', credentials: 'include' }));
  await openRoleEditorMatrix(page, '/admin/team');

  const adminGroups = matrixGroupHeaders(page);
  await expect(adminGroups.nth(0)).toHaveText('Operations');
  await expect(adminGroups.filter({ hasText: 'Platform' })).toBeVisible();
  await expect(page.getByRole('row', { name: /^Team\b/i })).toBeVisible();
});

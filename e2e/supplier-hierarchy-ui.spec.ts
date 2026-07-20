import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 120_000 });

test('admin impersonate supplier → dashboard → business → enter store → back', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  await page.goto('/admin/vendors', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Suppliers$/i })).toBeVisible({ timeout: 45_000 });

  const impBtn = page.getByTestId('impersonate-supplier').first();
  if (await impBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
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
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  }

  await expect(page).toHaveURL(/\/vendor\/overview/, { timeout: 45_000 });
  await expect(page.getByTestId('supplier-dashboard')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('kpi-businesses')).toBeVisible();
  await expect(page.getByTestId('kpi-revenue')).toBeVisible();
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByRole('link', { name: /^Dashboard$/i })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Orders$/i })).toBeVisible();
  // Store-ops catalog should not appear at supplier level
  await expect(sidebar.getByRole('link', { name: /^Products$/i })).toHaveCount(0);

  await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
  const viewBusiness = page.getByTestId('view-business').first();
  await expect(viewBusiness).toBeVisible({ timeout: 20_000 });
  await viewBusiness.click();

  await expect(page).toHaveURL(/\/vendor\/businesses\/[a-f0-9-]+/, { timeout: 30_000 });
  await expect(page.getByTestId('business-detail')).toBeVisible();
  await expect(page.getByTestId('back-to-supplier')).toBeVisible();

  const enterStore = page.getByTestId('enter-store').first();
  await expect(enterStore).toBeVisible({ timeout: 15_000 });
  await enterStore.click();

  await expect(page).toHaveURL(/\/vendor\/dashboard/, { timeout: 45_000 });
  await expect(page.getByText('Store Ops')).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('horeca_supplier_entered_store');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/vendor\/overview/, { timeout: 30_000 });
  await expect(page.getByTestId('supplier-dashboard')).toBeVisible({ timeout: 20_000 });
});

test('business-wide supplier lands on dashboard; store ops requires enter', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');

  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('horeca_supplier_entered_store');
    } catch {
      /* ignore */
    }
  });

  await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  const daily = page.getByRole('button', { name: /Daily Fresh Foods/i });
  if (await daily.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
    await daily.first().click();
    await page.waitForTimeout(500);
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  }

  await expect(page.getByTestId('supplier-dashboard')).toBeVisible({ timeout: 45_000 });
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByRole('link', { name: /^Dashboard$/i })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Orders$/i })).toBeVisible();

  await page.goto('/vendor/all-orders', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('supplier-all-orders')).toBeVisible({ timeout: 30_000 });

  await page.goto('/vendor/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/vendor\/overview/, { timeout: 30_000 });
});

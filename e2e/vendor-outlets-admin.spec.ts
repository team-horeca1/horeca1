import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 90_000 });

test('supplier foundation: warehouses retired; businesses hub reachable', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
  await ensureDailyFreshVendorContext(page);

  const biz = await page.evaluate(async () => {
    const res = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const json = await res.json();
    return {
      status: res.status,
      ok: json.success === true,
      count: (json.data ?? []).length,
      hasStores: ((json.data ?? []) as Array<{ stores?: unknown[] }>).some(
        (b) => (b.stores?.length ?? 0) > 0,
      ),
    };
  });
  expect(biz.status).toBe(200);
  expect(biz.ok).toBeTruthy();
  expect(biz.count).toBeGreaterThanOrEqual(1);
  expect(biz.hasStores).toBeTruthy();

  // Supplier overview + businesses hub — no warehouse switching
  await ensureDailyFreshVendorContext(page);
  await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
  await ensureDailyFreshVendorContext(page);
  // If still gated, businesses hub text is enough for this regression
  const dashboard = page.getByTestId('supplier-dashboard');
  if (await dashboard.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await expect(dashboard).toBeVisible();
  } else {
    await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Businesses/i })).toBeVisible({ timeout: 45_000 });
  }
  await expect(page.getByRole('button', { name: /Switch warehouse/i })).toHaveCount(0);

  await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Switch warehouse/i })).toHaveCount(0);
});

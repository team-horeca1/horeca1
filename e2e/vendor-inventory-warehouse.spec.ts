import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 90_000 });

test('supplier foundation: inventory is Online Store scoped (no warehouse switch)', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
  await ensureDailyFreshVendorContext(page);

  const inv = await page.evaluate(async () => {
    const res = await fetch('/api/v1/vendor/inventory', { credentials: 'include' });
    return { status: res.status };
  });
  expect([200, 403]).toContain(inv.status);

  // Enter store ops so Inventory page is reachable
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });

  await page.goto('/vendor/inventory', { waitUntil: 'domcontentloaded' });
  await ensureDailyFreshVendorContext(page);
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/vendor/inventory', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /^Inventory$/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: /Switch warehouse/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /All warehouses/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /This warehouse/i })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /^Warehouse$/i })).toHaveCount(0);
  await expect(page.getByText(/Stock for this Online Store/i)).toBeVisible();
});

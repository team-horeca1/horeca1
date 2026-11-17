import { expect, test } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe('Supplier payables', () => {
  test('finance screen loads, filters, and does not claim bank verification', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await passwordLogin(page, 'admin@horeca1.com', 'admin123');
    await page.goto('/admin/finance');
    await expect(page.getByRole('heading', { name: 'Pay suppliers' })).toBeVisible();
    await expect(page.getByText('We do not call the bank.')).toBeVisible();
    await expect(page.getByText('We still owe suppliers')).toBeVisible();
    await expect(page.getByText('Ready to pay now')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payments being prepared' })).toBeVisible();

    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: 'Pay suppliers' })).toBeVisible();
      await page.screenshot({
        path: `docs/finance-ledger/screenshots/payables-${width}.png`,
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel('Search supplier').fill('no-such-supplier-xyz');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('No suppliers match these filters.')).toBeVisible();

    const response = await page.request.get('/api/v1/admin/finance/payables');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.kpis.outstandingIsCurrent).toBe(true);

    expect(errors).toEqual([]);
  });

  test('anonymous callers cannot read payables', async ({ request }) => {
    const response = await request.get('/api/v1/admin/finance/payables');
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

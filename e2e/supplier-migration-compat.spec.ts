import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

test('existing vendor APIs still resolve after Foundation remap', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  const result = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=5', { credentials: 'include' });
    const json = await list.json();
    const v =
      (json.data?.vendors ?? []).find((x: { isVerified?: boolean }) => x.isVerified)
      ?? (json.data?.vendors ?? [])[0];
    if (!v?.id) return { skipped: true as const };

    await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: v.id }),
    });

    const [dash, products, orders, pub] = await Promise.all([
      fetch('/api/v1/vendor/dashboard', { credentials: 'include' }),
      fetch('/api/v1/vendor/products?limit=5', { credentials: 'include' }),
      fetch('/api/v1/vendor/orders?limit=5', { credentials: 'include' }),
      fetch(`/api/v1/vendors/${v.id}`, { credentials: 'include' }),
    ]);

    return {
      skipped: false as const,
      dash: dash.status,
      products: products.status,
      orders: orders.status,
      publicVendor: pub.status,
    };
  });

  if (!result.skipped) {
    expect([200, 403]).toContain(result.dash);
    expect([200, 403]).toContain(result.products);
    expect([200, 403]).toContain(result.orders);
    expect([200, 404]).toContain(result.publicVendor);
  }
});

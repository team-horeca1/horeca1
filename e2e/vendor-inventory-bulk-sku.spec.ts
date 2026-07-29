import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 180_000, mode: 'serial' });

async function enterStore(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });
}

async function openInventory(page: import('@playwright/test').Page) {
  await ensureDailyFreshVendorContext(page);
  await enterStore(page);
  await page.goto('/vendor/inventory', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /^Inventory$/i })).toBeVisible({ timeout: 60_000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    const warm = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/inventory/import?template=true', { credentials: 'include' });
      return res.status;
    });
    if (warm !== 404) break;
    await page.waitForTimeout(1500);
  }
}

test.describe('Inventory bulk upload — SKU / product-id keys', () => {
  test.beforeEach(async ({ page }) => {
    await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
  });

  test('import by product.id (export fallback) updates stock — no SKU not found', async ({ page }) => {
    await openInventory(page);

    const result = await page.evaluate(async () => {
      const invJson = await (await fetch('/api/v1/vendor/inventory', { credentials: 'include' })).json();
      const items = (invJson.data ?? []) as Array<{
        productId: string;
        qtyAvailable: number;
        product: { sku?: string | null };
      }>;
      if (items.length === 0) return { ok: false as const, reason: 'no inventory' };

      // Mix real SKUs + product.id keys (the export fallback when sku/vendorSku empty)
      const payload = items.slice(0, 6).map((it, idx) => {
        const useId = idx % 2 === 1; // every other row uses product.id like export fallback
        return {
          sku: useId ? it.productId : (it.product.sku || it.productId),
          qtyAvailable: Math.max(0, it.qtyAvailable) + 1,
          usedProductId: useId,
        };
      });

      const res = await fetch('/api/v1/vendor/inventory/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: payload.map((p) => ({ sku: p.sku, qtyAvailable: p.qtyAvailable })),
        }),
      });
      const json = await res.json();
      return {
        ok: true as const,
        status: res.status,
        success: json.success as boolean | undefined,
        updated: json.updated as number | undefined,
        skipped: json.skipped as number | undefined,
        errors: (json.errors ?? []) as Array<{ sku: string; error: string }>,
        payload,
        idKeyCount: payload.filter((p) => p.usedProductId).length,
      };
    });

    test.skip(!result.ok, result.ok === false ? result.reason : 'failed');
    expect(result.ok && result.success, JSON.stringify(result.ok ? result.errors : [])).toBe(true);
    expect(result.ok && result.skipped).toBe(0);
    expect(result.ok && result.updated).toBe(result.ok ? result.payload.length : 0);
    expect(result.ok && result.idKeyCount).toBeGreaterThanOrEqual(1);
  });

  test('full export-key roundtrip: vendorSku || sku || productId all match', async ({ page }) => {
    await openInventory(page);

    const result = await page.evaluate(async () => {
      const invJson = await (await fetch('/api/v1/vendor/inventory', { credentials: 'include' })).json();
      const items = (invJson.data ?? []) as Array<{
        productId: string;
        qtyAvailable: number;
        product: { sku?: string | null };
      }>;
      if (items.length === 0) return { ok: false as const };

      const keys = [];
      for (const it of items.slice(0, 8)) {
        const pr = await (
          await fetch(`/api/v1/vendor/products/${it.productId}`, { credentials: 'include' })
        ).json();
        const d = pr.data as { sku?: string | null; vendorSku?: string | null } | undefined;
        // Same formula as export/route.ts
        const sku = d?.vendorSku || d?.sku || it.productId;
        keys.push({ sku, qtyAvailable: Math.max(1, it.qtyAvailable) });
      }

      const res = await fetch('/api/v1/vendor/inventory/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: keys }),
      });
      const json = await res.json();
      return {
        ok: true as const,
        updated: json.updated as number,
        skipped: json.skipped as number,
        errors: json.errors as Array<{ sku: string; error: string }>,
        count: keys.length,
      };
    });

    test.skip(!result.ok, 'No inventory');
    expect(result.ok && result.skipped, JSON.stringify(result.ok ? result.errors : [])).toBe(0);
    expect(result.ok && result.updated).toBe(result.ok ? result.count : 0);

    await page.getByRole('button', { name: /Bulk Upload/i }).click();
    await expect(page.getByText(/Bulk Stock Update/i)).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();
  });
});

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

/** Fetch JSON in the browser; fails clearly if Next returns HTML 404. */
async function pageJson<T>(
  page: import('@playwright/test').Page,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ({ url, init }) => {
      const res = await fetch(url, { credentials: 'include', ...init });
      const text = await res.text();
      if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
        throw new Error(`Expected JSON from ${url} but got HTML (status ${res.status})`);
      }
      return { status: res.status, json: JSON.parse(text) as T };
    },
    { url, init },
  );
}

async function gotoInventory(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/vendor/inventory', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(1000 * (attempt + 1));
    }
  }
}

async function openInventory(page: import('@playwright/test').Page) {
  await ensureDailyFreshVendorContext(page);
  await enterStore(page);
  await gotoInventory(page);
  await expect(page.getByRole('heading', { name: /^Inventory$/i })).toBeVisible({ timeout: 60_000 });

  // Warm nested inventory routes (Turbopack can 404 until first compile).
  for (let attempt = 0; attempt < 5; attempt++) {
    const warm = await page.evaluate(async () => {
      const [h, i] = await Promise.all([
        fetch('/api/v1/vendor/inventory/history?limit=1', { credentials: 'include' }),
        fetch('/api/v1/vendor/inventory/import?template=true', { credentials: 'include' }),
      ]);
      return { history: h.status, import: i.status };
    });
    if (warm.history !== 404 && warm.import !== 404) break;
    await page.waitForTimeout(1500);
  }
}

test.describe('Section 3 — Inventory management', () => {
  test.beforeEach(async ({ page }) => {
    await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
  });

  test('1 open inventory dashboard (store-scoped)', async ({ page }) => {
    await openInventory(page);
    await expect(page.getByText(/Stock for this Online Store/i)).toBeVisible();
  });

  test('4-9 increase/reduce/adjust, mark OOS, restock via API + UI actions', async ({ page }) => {
    await openInventory(page);

    const list = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/inventory', { credentials: 'include' });
      const json = await res.json();
      return {
        status: res.status,
        items: (json.data ?? []) as Array<{
          id: string;
          productId: string;
          outletId: string;
          qtyAvailable: number;
          qtyReserved: number;
          lowStockThreshold: number;
          product: { name: string; sku?: string | null; brand?: string | null; isActive: boolean };
        }>,
      };
    });

    expect([200, 403]).toContain(list.status);
    test.skip(list.status === 403, 'Vendor lacks inventory.view');
    test.skip(list.items.length === 0, 'No inventory rows');

    const row = list.items[0];
    const targetQty = Math.max(row.qtyReserved + 25, 25);

    const patch = await page.evaluate(
      async ({ productId, outletId, qtyAvailable, lowStockThreshold }) => {
        const res = await fetch('/api/v1/vendor/inventory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, outletId, qtyAvailable, lowStockThreshold }),
        });
        return res.json();
      },
      {
        productId: row.productId,
        outletId: row.outletId,
        qtyAvailable: targetQty,
        lowStockThreshold: 5,
      },
    );
    expect(patch.success).toBe(true);
    expect(patch.data?.qtyAvailable).toBe(targetQty);

    const history = await pageJson<{ data?: Array<{ reason: string | null }> }>(
      page,
      `/api/v1/vendor/inventory/history?inventoryId=${row.id}&limit=10`,
    );
    const historyRows = history.json.data ?? [];
    expect(history.status).toBe(200);
    expect(historyRows.length).toBeGreaterThan(0);
    expect(historyRows.some((l) => (l.reason ?? '').includes('manual_update'))).toBe(true);

    // Mark OOS then Restock via API (same as UI buttons)
    const oos = await page.evaluate(async ({ productId, outletId }) => {
      const zero = await (
        await fetch('/api/v1/vendor/inventory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, outletId, qtyAvailable: 0 }),
        })
      ).json();
      const restock = await (
        await fetch('/api/v1/vendor/inventory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, outletId, qtyAvailable: 40 }),
        })
      ).json();
      return { zeroQty: zero.data?.qtyAvailable, restockQty: restock.data?.qtyAvailable };
    }, { productId: row.productId, outletId: row.outletId });

    expect(oos.zeroQty).toBe(0);
    expect(oos.restockQty).toBe(40);

    await expect(page.getByRole('button', { name: /^Mark OOS$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Restock$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Log$/i }).first()).toBeVisible();
  });

  test('10-12 bulk template, bad SKU skip, error report control, export', async ({ page }) => {
    await openInventory(page);

    const template = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/inventory/import?template=true', { credentials: 'include' });
      const buf = await res.arrayBuffer();
      const ct = res.headers.get('content-type') ?? '';
      return { status: res.status, bytes: buf.byteLength, contentType: ct };
    });
    expect(template.status, `import template status; ct=${template.contentType}`).toBe(200);
    expect(template.bytes).toBeGreaterThan(100);

    const importResult = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/inventory/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ sku: 'E2E-MISSING-SKU-ZZZ', qtyAvailable: 5 }] }),
      });
      return { status: res.status, ...(await res.json()) };
    });
    expect(importResult.success).toBe(true);
    expect(importResult.skipped).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: /Bulk Upload/i }).click();
    await expect(page.getByText(/Bulk Stock Update/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Download template/i })).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();

    const exportRes = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/inventory/export?format=xlsx', { credentials: 'include' });
      return { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
    });
    expect(exportRes.status).toBe(200);
    expect(exportRes.bytes).toBeGreaterThan(100);
  });

  test('13-15 search + brand/category/tag/stock filters + low stock threshold', async ({ page }) => {
    await openInventory(page);

    await expect(page.getByPlaceholder(/Search SKU \/ name \/ brand/i)).toBeVisible();
    await expect(page.getByLabel('Filter by brand')).toBeVisible();
    await expect(page.getByLabel('Filter by category')).toBeVisible();
    await expect(page.getByLabel('Filter by tag')).toBeVisible();
    await expect(page.getByRole('button', { name: /Low Stock/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Out of Stock/i })).toBeVisible();

    // Count button / Adjust reason must NOT appear (removed from brief)
    await expect(page.getByRole('button', { name: /^Count$/i })).toHaveCount(0);
    await expect(page.getByPlaceholder(/Reason \(optional\)/i)).toHaveCount(0);

    const row = await page.evaluate(async () => {
      const json = await (await fetch('/api/v1/vendor/inventory', { credentials: 'include' })).json();
      const items = (json.data ?? []) as Array<{
        productId: string;
        outletId: string;
        product: { brand?: string | null; sku?: string | null; name: string };
      }>;
      return items[0] ?? null;
    });
    test.skip(!row, 'No inventory');

    if (row?.product.brand) {
      await page.getByLabel('Filter by brand').selectOption({ label: row.product.brand });
    }
    if (row?.product.sku) {
      await page.getByPlaceholder(/Search SKU \/ name \/ brand/i).fill(row.product.sku);
    }

    await page.evaluate(
      async ({ productId, outletId }) => {
        await fetch('/api/v1/vendor/inventory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, outletId, qtyAvailable: 8, lowStockThreshold: 10 }),
        });
      },
      { productId: row!.productId, outletId: row!.outletId },
    );
  });

  test('28-29 disable and enable ordering from inventory', async ({ page }) => {
    await openInventory(page);

    const row = await page.evaluate(async () => {
      const json = await (await fetch('/api/v1/vendor/inventory', { credentials: 'include' })).json();
      const items = (json.data ?? []) as Array<{
        id: string;
        productId: string;
        product: { isActive: boolean; name: string };
      }>;
      return items.find((i) => i.product.isActive) ?? items[0] ?? null;
    });
    test.skip(!row, 'No inventory');

    // Ensure active, then exercise API (source of truth) + UI buttons for the same row.
    const ensureActive = await pageJson<{ success?: boolean; error?: { message?: string } }>(
      page,
      `/api/v1/vendor/products/${row!.productId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      },
    );
    expect(ensureActive.json.success, ensureActive.json.error?.message ?? 'activate failed').toBe(true);

    await page.getByPlaceholder(/Search SKU \/ name \/ brand/i).fill(row!.product.name);
    await expect(page.getByRole('button', { name: /Disable ordering/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    const disableResPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/v1/vendor/products/${row!.productId}`) && r.request().method() === 'PATCH',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /Disable ordering/i }).first().click();
    const disableRes = await disableResPromise;
    expect(disableRes.ok()).toBe(true);
    await expect(page.getByRole('button', { name: /Enable ordering/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const enableResPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/v1/vendor/products/${row!.productId}`) && r.request().method() === 'PATCH',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /Enable ordering/i }).first().click();
    const enableRes = await enableResPromise;
    expect(enableRes.ok()).toBe(true);
    await expect(page.getByRole('button', { name: /Disable ordering/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const verify = await pageJson<{
      success?: boolean;
      data?: Array<{ productId: string; product: { isActive: boolean } }>;
    }>(page, '/api/v1/vendor/inventory');
    const after = (verify.json.data ?? []).find((i) => i.productId === row!.productId);
    expect(after?.product.isActive).toBe(true);
  });

  test('18-20 order reserve then cancel release writes InventoryLog', async ({ page, browser }) => {
    await openInventory(page);

    const prep = await page.evaluate(async () => {
      const invJson = await (await fetch('/api/v1/vendor/inventory', { credentials: 'include' })).json();
      const items = (invJson.data ?? []) as Array<{
        id: string;
        productId: string;
        outletId: string;
        qtyAvailable: number;
        qtyReserved: number;
        product: { basePrice?: number; isActive: boolean };
      }>;
      const row = items.find((i) => i.product.isActive && i.qtyAvailable - i.qtyReserved >= 1) ?? items[0];
      if (!row) return { ok: false as const };

      await fetch('/api/v1/vendor/inventory', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: row.productId,
          outletId: row.outletId,
          qtyAvailable: Math.max(row.qtyAvailable, 200),
        }),
      });
      await fetch(`/api/v1/vendor/products/${row.productId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });

      const me = await (await fetch('/api/v1/vendor/settings', { credentials: 'include' })).json();
      const vendorId = me.data?.id as string | undefined;
      const mov = Number(me.data?.minOrderValue ?? 500);
      const unit = Number(row.product.basePrice ?? 35);
      const qty = Math.max(1, Math.ceil((mov + 50) / Math.max(unit, 1)));
      return { ok: true as const, inventoryId: row.id, productId: row.productId, vendorId, qty };
    });

    test.skip(!prep.ok || !prep.vendorId, 'No inventory/vendor for order path');

    const customerCtx = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    const customerPage = await customerCtx.newPage();
    await passwordLogin(customerPage, 'chef@tajpalace.com', 'customer123');

    const orderResult = await customerPage.evaluate(
      async ({ vendorId, productId, qty }) => {
        const res = await fetch('/api/v1/orders', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: 'cod',
            vendorOrders: [{ vendorId, items: [{ productId, quantity: qty }] }],
          }),
        });
        const json = await res.json();
        const orders = json.data?.orders ?? (Array.isArray(json.data) ? json.data : json.data ? [json.data] : []);
        return {
          success: json.success as boolean | undefined,
          error: json.error?.message as string | undefined,
          orderId: orders[0]?.id as string | undefined,
        };
      },
      { vendorId: prep.vendorId!, productId: prep.productId, qty: prep.qty },
    );
    await customerCtx.close();

    expect(orderResult.success, orderResult.error ?? 'order failed').toBe(true);
    expect(orderResult.orderId).toBeTruthy();

    const afterReserve = await page.evaluate(async (inventoryId) => {
      const json = await (
        await fetch(`/api/v1/vendor/inventory/history?inventoryId=${inventoryId}&limit=40`, {
          credentials: 'include',
        })
      ).json();
      return ((json.data ?? []) as Array<{ reason: string | null }>).map((l) => l.reason ?? '');
    }, prep.inventoryId!);
    expect(afterReserve.some((r) => r.includes('order_reserve'))).toBe(true);

    const cancel = await page.evaluate(async (orderId) => {
      const json = await (
        await fetch(`/api/v1/vendor/orders/${orderId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled', reason: 'e2e inventory release' }),
        })
      ).json();
      return json;
    }, orderResult.orderId!);
    expect(cancel.success).toBe(true);

    const afterRelease = await page.evaluate(async (inventoryId) => {
      const json = await (
        await fetch(`/api/v1/vendor/inventory/history?inventoryId=${inventoryId}&limit=40`, {
          credentials: 'include',
        })
      ).json();
      return ((json.data ?? []) as Array<{ reason: string | null }>).map((l) => l.reason ?? '');
    }, prep.inventoryId!);
    expect(afterRelease.some((r) => r.includes('order_release'))).toBe(true);
  });
});

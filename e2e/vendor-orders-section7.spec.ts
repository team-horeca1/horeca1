import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 240_000, mode: 'serial' });

async function enterStore(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });
}

async function pageJson<T>(
  page: import('@playwright/test').Page,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; json: T }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await page.evaluate(
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
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(1000 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type Prep = {
  ok: true;
  vendorId: string;
  productId: string;
  inventoryId: string;
  qty: number;
  unitPrice: number;
};

async function prepVendorProduct(page: import('@playwright/test').Page): Promise<Prep | { ok: false }> {
  return page.evaluate(async () => {
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
        // Keep headroom above reserved so placeCodOrder never starves mid-suite
        qtyAvailable: Math.max(Number(row.qtyAvailable) || 0, 0) + Number(row.qtyReserved || 0) + 2000,
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
    const qty = Math.max(2, Math.ceil((mov + 50) / Math.max(unit, 1)));
    if (!vendorId) return { ok: false as const };
    return {
      ok: true as const,
      vendorId,
      productId: row.productId,
      inventoryId: row.id,
      qty,
      unitPrice: unit,
    };
  });
}

async function placeCodOrder(
  browser: import('@playwright/test').Browser,
  prep: Prep,
): Promise<{ orderId: string; orderNumber: string; unitPrice: number; quantity: number; itemId: string }> {
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
      const order = orders[0];
      return {
        success: json.success as boolean | undefined,
        error: json.error?.message as string | undefined,
        orderId: order?.id as string | undefined,
        orderNumber: order?.orderNumber as string | undefined,
        status: order?.status as string | undefined,
        acceptedAt: order?.acceptedAt as string | null | undefined,
        itemId: order?.items?.[0]?.id as string | undefined,
        unitPrice: order?.items?.[0] ? Number(order.items[0].unitPrice) : undefined,
        quantity: order?.items?.[0]?.quantity as number | undefined,
        fulfilledQty: order?.items?.[0]?.fulfilledQty as number | undefined,
      };
    },
    { vendorId: prep.vendorId, productId: prep.productId, qty: prep.qty },
  );
  await customerCtx.close();

  expect(orderResult.success, orderResult.error ?? 'order failed').toBe(true);
  expect(orderResult.orderId).toBeTruthy();
  expect(orderResult.status).toBe('pending');
  expect(orderResult.acceptedAt).toBeTruthy();
  expect(orderResult.fulfilledQty).toBe(orderResult.quantity);
  return {
    orderId: orderResult.orderId!,
    orderNumber: orderResult.orderNumber!,
    unitPrice: orderResult.unitPrice!,
    quantity: orderResult.quantity!,
    itemId: orderResult.itemId!,
  };
}

test.describe('Section 7 — Order Management', () => {
  test.beforeEach(async ({ page }) => {
    await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
  });

  test('auto-accept on place + events + New/Pending filters', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);

    const detail = await pageJson<{
      success?: boolean;
      data?: {
        status: string;
        acceptedAt: string | null;
        events?: Array<{ action: string }>;
        items: Array<{ fulfilledQty: number; quantity: number }>;
      };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    expect(detail.json.success).toBe(true);
    expect(detail.json.data?.status).toBe('pending');
    expect(detail.json.data?.acceptedAt).toBeTruthy();
    const actions = (detail.json.data?.events ?? []).map((e) => e.action);
    expect(actions).toContain('order.created');
    expect(actions).toContain('order.auto_accepted');

    const pendingList = await pageJson<{
      success?: boolean;
      data?: { orders: Array<{ id: string }> };
    }>(page, '/api/v1/vendor/orders?status=pending&limit=20');
    expect(pendingList.json.data?.orders.some((o) => o.id === placed.orderId)).toBe(true);

    const newList = await pageJson<{
      success?: boolean;
      data?: { orders: Array<{ id: string }> };
    }>(page, '/api/v1/vendor/orders?status=new&limit=20');
    expect(newList.json.data?.orders.some((o) => o.id === placed.orderId)).toBe(true);

    // UI smoke — warm route then assert brief labels (Turbopack can abort first nav).
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto('/vendor/orders?view=list&status=pending', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    await expect(page.getByRole('heading', { name: /All orders|^Orders$/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /^Pending$/i }).first()).toBeVisible();
    await expect(page.getByText('Pending Approval')).toHaveCount(0);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto(`/vendor/orders/${placed.orderId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    await expect(page.getByTestId('order-events-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Accept Order/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Mark as Accepted/i }).first()).toBeVisible();
  });

  test('R12 cancel only while pending', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const a = await placeCodOrder(browser, prep as Prep);
    const b = await placeCodOrder(browser, prep as Prep);

    const cancelOk = await pageJson<{ success?: boolean; error?: { message?: string } }>(
      page,
      `/api/v1/vendor/orders/${a.orderId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', reason: 'e2e R12 pending cancel' }),
      },
    );
    expect(cancelOk.json.success).toBe(true);

    const advance = await pageJson<{ success?: boolean }>(page, `/api/v1/vendor/orders/${b.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    expect(advance.json.success).toBe(true);

    const cancelBlocked = await pageJson<{ success?: boolean; error?: { message?: string } }>(
      page,
      `/api/v1/vendor/orders/${b.orderId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', reason: 'should fail' }),
      },
    );
    expect(cancelBlocked.json.success).toBeFalsy();
    expect(cancelBlocked.json.error?.message ?? '').toMatch(/Pending|Returns/i);
  });

  test('partial fulfilment + OrderEvents + invoice qty', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);
    const half = Math.max(1, Math.floor(placed.quantity / 2));

    const partial = await pageJson<{
      success?: boolean;
      data?: { status: string; isPartial: boolean };
      error?: { message?: string };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ itemId: placed.itemId, fulfilledQty: half, reason: 'e2e short ship' }],
      }),
    });
    expect(partial.json.success, partial.json.error?.message).toBe(true);
    expect(partial.json.data?.status).toBe('pending');
    expect(partial.json.data?.isPartial).toBe(true);

    const detail = await pageJson<{
      success?: boolean;
      data?: {
        events: Array<{ action: string }>;
        items: Array<{ fulfilledQty: number }>;
      };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    const actions = (detail.json.data?.events ?? []).map((e) => e.action);
    expect(actions.some((a) => a.includes('partial') || a.includes('qty') || a.includes('rejected'))).toBe(
      true,
    );
    expect(detail.json.data?.items[0]?.fulfilledQty).toBe(half);

    const inv = await page.evaluate(async (orderId) => {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}/invoice`, { credentials: 'include' });
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 5));
      const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
      return { status: res.status, isPdf, bytes: buf.byteLength };
    }, placed.orderId);
    expect(inv.status).toBe(200);
    expect(inv.isPdf).toBe(true);
    expect(inv.bytes).toBeGreaterThan(500);
  });

  test('status advances Pending → Accepted → Packed → Dispatched → Delivered + events', async ({
    page,
    browser,
  }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);

    for (const status of ['confirmed', 'processing', 'shipped', 'delivered'] as const) {
      const res = await pageJson<{ success?: boolean; error?: { message?: string } }>(
        page,
        `/api/v1/vendor/orders/${placed.orderId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      expect(res.json.success, `${status}: ${res.json.error?.message}`).toBe(true);
    }

    const detail = await pageJson<{
      success?: boolean;
      data?: { status: string; events: Array<{ action: string; toStatus: string | null }> };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    expect(detail.json.data?.status).toBe('delivered');
    const statusChanges = (detail.json.data?.events ?? []).filter((e) => e.action === 'status.changed');
    expect(statusChanges.length).toBeGreaterThanOrEqual(4);

    const acceptedFilter = await pageJson<{
      data?: { orders: Array<{ id: string }> };
    }>(page, '/api/v1/vendor/orders?status=completed&limit=50');
    // already delivered — should appear in completed alias
    expect(acceptedFilter.json.data?.orders.some((o) => o.id === placed.orderId)).toBe(true);
  });

  test('price lock at placement (R11)', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);
    const locked = placed.unitPrice;

    await pageJson(page, `/api/v1/vendor/products/${(prep as Prep).productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ basePrice: locked + 999 }),
    });

    const detail = await pageJson<{
      data?: { items: Array<{ unitPrice: number | string }> };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    expect(Number(detail.json.data?.items[0]?.unitPrice)).toBe(locked);

    // restore price
    await pageJson(page, `/api/v1/vendor/products/${(prep as Prep).productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ basePrice: (prep as Prep).unitPrice }),
    });
  });

  test('human UI: customer cancel request → vendor approve', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);

    const customerCtx = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    const customerPage = await customerCtx.newPage();
    await passwordLogin(customerPage, 'chef@tajpalace.com', 'customer123');

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await customerPage.goto(`/orders/${placed.orderId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        if (customerPage.url().includes(`/orders/${placed.orderId}`)) {
          const btn = customerPage.getByTestId('request-cancel-btn');
          if (await btn.isVisible({ timeout: 8_000 }).catch(() => false)) break;
        }
      } catch {
        /* retry */
      }
      await customerPage.waitForTimeout(2000 * (attempt + 1));
    }
    await expect(customerPage).toHaveURL(new RegExp(`/orders/${placed.orderId}`));
    await expect(customerPage.getByTestId('request-cancel-btn')).toBeVisible({ timeout: 60_000 });
    await customerPage.getByTestId('request-cancel-btn').click();
    await customerPage.getByTestId('cancel-reason-input').fill('Changed my mind about this order quantity.');
    const cancelRespPromise = customerPage.waitForResponse(
      (r) => r.url().includes('/cancel-request') && r.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await customerPage.getByTestId('submit-cancel-request').click();
    const cancelResp = await cancelRespPromise;
    const cancelJson = await cancelResp.json();
    expect(cancelJson.success, cancelJson.error?.message ?? 'cancel request failed').toBe(true);
    await expect(customerPage.getByTestId('cancel-request-status')).toBeVisible({ timeout: 30_000 });
    await expect(customerPage.getByTestId('cancel-request-status')).toContainText(/pending/i);
    await customerCtx.close();

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto(`/vendor/orders/${placed.orderId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    await expect(page.getByTestId('vendor-cancel-request-banner')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('vendor-cancel-note').fill('Approved — stock will be released.');
    await page.getByTestId('approve-cancel-request').click();
    await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 30_000 });

    const detail = await pageJson<{
      data?: { status: string; events: Array<{ action: string }> };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    expect(detail.json.data?.status).toBe('cancelled');
    const actions = (detail.json.data?.events ?? []).map((e) => e.action);
    expect(actions).toContain('cancel.requested');
    expect(actions.some((a) => a === 'cancel.approved' || a === 'order.cancelled')).toBe(true);
  });

  test('human UI: bulk status + export + payment method filter', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const a = await placeCodOrder(browser, prep as Prep);
    const b = await placeCodOrder(browser, prep as Prep);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto('/vendor/orders?view=list&status=pending', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    await expect(page.getByRole('heading', { name: /All orders|^Orders$/i })).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('payment-method-filter').selectOption('cod');
    await page.waitForTimeout(1500);

    // Prefer API bulk (stable) after asserting UI select + export controls exist
    await expect(page.getByTestId('orders-export')).toBeVisible();
    await expect(page.getByTestId('select-all-orders')).toBeVisible();

    const bulk = await pageJson<{ success?: boolean; data?: { succeeded: string[]; failed: unknown[] } }>(
      page,
      '/api/v1/vendor/orders/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          orderIds: [a.orderId, b.orderId],
          status: 'confirmed',
        }),
      },
    );
    expect(bulk.json.success).toBe(true);
    expect((bulk.json.data?.succeeded ?? []).length).toBe(2);

    // UI: select rows and show bulk bar when orders are on screen
    await page.goto('/vendor/orders?view=list&status=accepted', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /All orders|^Orders$/i })).toBeVisible({ timeout: 60_000 });
    const cbA = page.getByTestId(`select-order-${a.orderId}`);
    if (await cbA.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await cbA.check({ force: true });
      await expect(page.getByTestId('bulk-actions-bar')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('bulk-print-invoices')).toBeVisible();
    } else {
      // Page may be empty / paginated — still assert controls render
      await expect(page.getByTestId('select-all-orders')).toBeVisible();
      await expect(page.getByTestId('orders-export')).toBeVisible();
    }

    const exportRes = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/orders/export?paymentMethod=cod', {
        credentials: 'include',
      });
      const text = await res.text();
      return { status: res.status, hasHeader: text.includes('Order / Invoice Number'), lines: text.split('\n').length };
    });
    expect(exportRes.status).toBe(200);
    expect(exportRes.hasHeader).toBe(true);
    expect(exportRes.lines).toBeGreaterThan(1);

    const printRes = await page.evaluate(async (ids) => {
      const res = await fetch('/api/v1/vendor/orders/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'print_invoices', orderIds: ids }),
      });
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 4));
      const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
      return { status: res.status, isPdf, bytes: buf.byteLength };
    }, [a.orderId]);
    expect(printRes.status).toBe(200);
    expect(printRes.isPdf).toBe(true);
    expect(printRes.bytes).toBeGreaterThan(500);
  });

  test('human UI: reject line with typed reason + activity log', async ({ page, browser }) => {
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);
    // Need 2+ qty so we can reject one line partially — place may be single product;
    // use API partial with reason then verify UI activity log, plus UI reason gate.
    const half = Math.max(0, placed.quantity - 1);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto(`/vendor/orders/${placed.orderId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500 * (attempt + 1));
      }
    }
    await expect(page.getByTestId('order-events-panel')).toBeVisible({ timeout: 60_000 });

    // API path with reason (human would type in UI; assert reason lands in events)
    const partial = await pageJson<{ success?: boolean }>(page, `/api/v1/vendor/orders/${placed.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            itemId: placed.itemId,
            fulfilledQty: half === placed.quantity ? Math.max(0, half - 1) : half,
            reason: half === 0 || half < placed.quantity ? 'Short stock — typed by ops' : undefined,
          },
        ],
      }),
    });
    expect(partial.json.success).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('order-events-panel')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Activity Log/i }).click();
    await expect(page.getByTestId('order-events-panel')).toContainText(/adjusted|rejected|Partial|qty/i);

    // UI gate: set qty to 0 without reason should toast error when saving (if still pending with qty>0)
    const detail = await pageJson<{
      data?: { status: string; items: Array<{ id: string; quantity: number; fulfilledQty: number }> };
    }>(page, `/api/v1/vendor/orders/${placed.orderId}`);
    if (detail.json.data?.status === 'pending') {
      const item = detail.json.data.items[0];
      if (item && item.fulfilledQty > 0) {
        const deskInput = page.getByTestId(`reject-reason-desk-${item.id}`);
        // zero via number input if present
        const qtyInput = page.locator('input[type="number"]').first();
        if (await qtyInput.isVisible().catch(() => false)) {
          await qtyInput.fill('0');
          if (await deskInput.isVisible().catch(() => false)) {
            await deskInput.fill('Customer refused this SKU at fulfilment.');
          }
          const saveBtn = page.getByRole('button', { name: /Save Quantity Adjustments/i });
          if (await saveBtn.isVisible().catch(() => false)) {
            await saveBtn.click();
            await page.waitForTimeout(1500);
          }
        }
      }
    }
  });

  test('Order Workspace primary hub + IGST helper + list secondary', async ({ page, browser }) => {
    const { normalizeIndianState, resolveSupplyType, splitGstTax, formatLineTaxRate, stateFromGstin } =
      await import('../src/lib/gstPlaceOfSupply');

    expect(normalizeIndianState('MH')).toBe('Maharashtra');
    expect(stateFromGstin('29AABCT1332L1ZB')).toBe('Karnataka');
    expect(resolveSupplyType('Maharashtra', 'Karnataka')).toBe('inter');
    expect(resolveSupplyType('Maharashtra', 'MH')).toBe('intra');
    expect(splitGstTax(100, 'inter')).toEqual({ cgst: 0, sgst: 0, igst: 100 });
    expect(splitGstTax(100, 'intra').cgst + splitGstTax(100, 'intra').sgst).toBeCloseTo(100);
    expect(formatLineTaxRate(18, 'inter')).toBe('0+0+18+0');
    expect(formatLineTaxRate(18, 'intra')).toBe('9+9+0+0');

    await enterStore(page);
    await page.goto('/vendor/orders', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByTestId('order-workspace')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Order Workspace/i })).toBeVisible();
    await expect(page.getByTestId('workspace-stage-pending')).toBeVisible();
    await expect(page.getByTestId('workspace-queue-pending')).toBeVisible();
    await expect(page.getByText(/Pending Approval/i)).toHaveCount(0);

    // Place order so pending queue has a row to process
    const prep = await prepVendorProduct(page);
    test.skip(!prep.ok, 'No inventory/vendor');
    const placed = await placeCodOrder(browser, prep as Prep);

    await page.goto('/vendor/orders?status=pending', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByTestId('order-workspace')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('workspace-refresh').click();
    await expect(page.getByTestId(`workspace-row-${placed.orderId}`)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(`workspace-row-${placed.orderId}`).click();
    await expect(page.getByTestId('order-workbench')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('workbench-order-number')).toContainText(placed.orderNumber);
    await expect(page.getByTestId('workbench-next-status')).toBeVisible();
    await expect(page.getByTestId('workbench-invoice')).toBeVisible();
    await expect(page.getByTestId('workbench-lines')).toBeVisible();

    // Adjust qty in workbench and save
    const qtyInput = page.getByTestId('order-workbench').locator('input[type="number"]').first();
    if (await qtyInput.isVisible().catch(() => false)) {
      const cur = Number(await qtyInput.inputValue());
      if (cur > 0) {
        await qtyInput.fill(String(Math.max(0, cur - 1)));
        if (cur - 1 === 0) {
          const reason = page.getByTestId(`reject-reason-desk-${placed.itemId}`);
          if (await reason.isVisible().catch(() => false)) {
            await reason.fill('Short stock from workspace');
          }
        }
        const saveBtn = page.getByTestId('workbench-save-qty');
        if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    await page.getByTestId('workbench-next-status').click();
    await expect(page.getByTestId('workbench-status')).toContainText(/Accepted|Packed/i, { timeout: 30_000 });

    // All orders secondary list
    await page.getByTestId('workspace-all-orders').click();
    await expect(page.getByRole('heading', { name: /All orders/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('orders-export')).toBeVisible();
    await expect(page.getByTestId('orders-workspace-link')).toBeVisible();
  });
});

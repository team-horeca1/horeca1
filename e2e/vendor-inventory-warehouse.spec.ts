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

async function adminImpersonateVendor(page: Page, vendorId: string) {
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

async function adminImpersonateMultiWarehouseVendor(page: Page) {
  const vendorIds = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=20', { credentials: 'include' });
    const json = await list.json();
    const vendors = json.data?.vendors ?? [];
    return vendors
      .filter((v: { isActive?: boolean }) => v.isActive !== false)
      .map((v: { id: string }) => v.id) as string[];
  });
  expect(vendorIds.length).toBeGreaterThan(0);

  for (const id of vendorIds) {
    await adminImpersonateVendor(page, id);
    const count = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/outlets', { credentials: 'include' });
      const json = await res.json();
      return (json.data?.outlets ?? []).length as number;
    });
    if (count >= 2) return;
  }

  const created = await page.evaluate(async () => {
    const outletsRes = await fetch('/api/v1/vendor/outlets', { credentials: 'include' });
    const outletsJson = await outletsRes.json();
    const baId = outletsJson.data?.businessAccount?.id as string | undefined;
    if (!baId) return { ok: false, reason: 'no business account' };
    const res = await fetch(`/api/v1/account/${baId}/outlets`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `E2E Warehouse ${Date.now() % 100000}`,
        addressLine: 'E2E Test Address, Mumbai',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        latitude: 19.076,
        longitude: 72.8777,
      }),
    });
    const json = await res.json();
    return { ok: res.ok && json.success, reason: json.error?.message ?? String(res.status) };
  });
  expect(created.ok, `Failed to create second warehouse: ${created.reason}`).toBeTruthy();
}

async function listInventory(page: Page, outletId: string) {
  return page.evaluate(async (oid) => {
    const res = await fetch(`/api/v1/vendor/inventory?outletId=${oid}`, { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? 'inventory list failed');
    return (json.data ?? []) as Array<{
      productId: string;
      outletId: string;
      qtyAvailable: number;
      product: { name: string };
    }>;
  }, outletId);
}

async function patchStock(page: Page, productId: string, outletId: string, qtyAvailable: number) {
  const result = await page.evaluate(async ({ productId, outletId, qtyAvailable }) => {
    const res = await fetch('/api/v1/vendor/inventory', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, outletId, qtyAvailable }),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.success,
      message: json.error?.message ?? String(res.status),
      qty: json.data?.qtyAvailable as number | undefined,
    };
  }, { productId, outletId, qtyAvailable });
  expect(result.ok, result.message).toBeTruthy();
  expect(result.qty).toBe(qtyAvailable);
}

/** UI switch via strip — must update strip label + inventory fetch scope. */
async function uiSwitchWarehouse(page: Page, outlet: { id: string; name: string }) {
  const switchBtn = page.getByRole('button', { name: /Switch warehouse/i });
  await expect(switchBtn).toBeVisible({ timeout: 15_000 });
  await switchBtn.click({ force: true });
  const option = page
    .locator('div.absolute button')
    .filter({ hasText: outlet.name })
    .first();
  await expect(option).toBeVisible({ timeout: 10_000 });

  const inventoryFetch = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/vendor/inventory')
      && r.request().method() === 'GET'
      && r.url().includes(`outletId=${outlet.id}`)
      && r.ok(),
    { timeout: 20_000 },
  );
  await option.click({ force: true });
  await inventoryFetch;

  await expect(
    page.locator('span.font-bold.text-emerald-900').filter({ hasText: outlet.name }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(new RegExp(`Editing stock for ${outlet.name}`, 'i')),
  ).toBeVisible({ timeout: 15_000 });
}

test('warehouse switch keeps stock independent + UI stays in sync', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');
  await adminImpersonateMultiWarehouseVendor(page);

  const outlets = await page.evaluate(async () => {
    const res = await fetch('/api/v1/vendor/outlets', { credentials: 'include' });
    const json = await res.json();
    return (json.data?.outlets ?? []) as Array<{ id: string; name: string }>;
  });
  expect(outlets.length).toBeGreaterThanOrEqual(2);

  const warehouseA = outlets[0]!;
  const warehouseB = outlets[1]!;

  // Seed known independent stock via API
  await page.evaluate(async (id) => {
    await fetch('/api/v1/admin/impersonate', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId: id }),
    });
  }, warehouseA.id);
  const itemsA = await listInventory(page, warehouseA.id);
  expect(itemsA.length).toBeGreaterThan(0);
  const productId = itemsA[0]!.productId;
  const productName = itemsA[0]!.product.name;

  await listInventory(page, warehouseB.id);

  const qtyA = 111 + (Date.now() % 50);
  const qtyB = 222 + (Date.now() % 50);
  expect(qtyA).not.toBe(qtyB);
  await patchStock(page, productId, warehouseA.id, qtyA);
  await patchStock(page, productId, warehouseB.id, qtyB);

  await page.goto('/vendor/inventory', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 30_000 });
  // Wait for outlet strip (multi-warehouse) to finish loading
  await expect(page.getByText(/^Warehouse$/i).or(page.getByText(/Operating from/i))).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Switch warehouse/i })).toBeVisible({ timeout: 30_000 });

  // Switch to A via UI
  await uiSwitchWarehouse(page, warehouseA);
  const rowA = page.locator('table tbody tr').filter({ hasText: productName }).first();
  await expect(rowA).toBeVisible({ timeout: 20_000 });
  await expect(rowA.locator('input[type="number"]').first()).toHaveValue(String(qtyA), { timeout: 15_000 });

  // Edit A via UI +
  const patchA = page.waitForResponse(
    (r) => r.url().includes('/api/v1/vendor/inventory') && r.request().method() === 'PATCH' && r.ok(),
    { timeout: 15_000 },
  );
  await rowA.locator('button').filter({ hasText: '+' }).first().click();
  const patchARes = await patchA;
  const patchABody = patchARes.request().postDataJSON() as { outletId?: string; qtyAvailable?: number };
  expect(patchABody.outletId).toBe(warehouseA.id);
  await expect.poll(async () => {
    const rows = await listInventory(page, warehouseA.id);
    return rows.find((r) => r.productId === productId)?.qtyAvailable;
  }, { timeout: 15_000 }).toBe(qtyA + 1);

  // B must be unchanged
  expect(await listInventory(page, warehouseB.id).then((r) => r.find((x) => x.productId === productId)?.qtyAvailable)).toBe(qtyB);

  // Switch to B via UI — must show B's qty, not A's
  await uiSwitchWarehouse(page, warehouseB);
  const rowB = page.locator('table tbody tr').filter({ hasText: productName }).first();
  await expect(rowB).toBeVisible({ timeout: 20_000 });
  await expect(rowB.locator('input[type="number"]').first()).toHaveValue(String(qtyB), { timeout: 15_000 });

  // Edit B via UI
  const patchB = page.waitForResponse(
    (r) => r.url().includes('/api/v1/vendor/inventory') && r.request().method() === 'PATCH' && r.ok(),
    { timeout: 15_000 },
  );
  await rowB.locator('button').filter({ hasText: '+' }).first().click();
  const patchBRes = await patchB;
  const patchBBody = patchBRes.request().postDataJSON() as { outletId?: string };
  expect(patchBBody.outletId).toBe(warehouseB.id);
  await expect.poll(async () => {
    const rows = await listInventory(page, warehouseB.id);
    return rows.find((r) => r.productId === productId)?.qtyAvailable;
  }, { timeout: 15_000 }).toBe(qtyB + 1);

  // Back to A — still qtyA+1, not qtyB+1
  await uiSwitchWarehouse(page, warehouseA);
  const rowAAgain = page.locator('table tbody tr').filter({ hasText: productName }).first();
  await expect(rowAAgain.locator('input[type="number"]').first()).toHaveValue(String(qtyA + 1), { timeout: 15_000 });
  expect(await listInventory(page, warehouseA.id).then((r) => r.find((x) => x.productId === productId)?.qtyAvailable)).toBe(qtyA + 1);
  expect(await listInventory(page, warehouseB.id).then((r) => r.find((x) => x.productId === productId)?.qtyAvailable)).toBe(qtyB + 1);

  // No duplicate Delivery pins button in inventory header
  await expect(page.getByRole('link', { name: /Delivery pins for/i })).toHaveCount(0);
  // Delivery pins available once inside Switch warehouse menu
  await page.getByRole('button', { name: /Switch warehouse/i }).click({ force: true });
  await expect(page.getByRole('link', { name: /Delivery pins for/i })).toBeVisible();
});

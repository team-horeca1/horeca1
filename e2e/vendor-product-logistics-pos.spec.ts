/**
 * Vendor product — country/shelf + duplicate POS SKU (Playwright).
 * Run: PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/vendor-product-logistics-pos.spec.ts --workers=1
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { credentialsLogin } from './helpers/auth';
import { pickLeafCategoryId } from './helpers/prodLifecycle';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const ADMIN_EMAIL = 'admin@horeca1.com';
const ADMIN_PASSWORD = 'admin123';
const AUTH_FILE = path.join('e2e', '.auth', 'logistics-pos-vendor.json');
const TEST_IMAGE =
  'https://ik.imagekit.io/demo/img/tr:w-400,h-400/default-image.jpg';

const ts = Date.now();
const productAName = `E2E Logistics A ${ts}`;
const productBName = `E2E Logistics B ${ts}`;
const slugA = `e2e-log-a-${ts}`;
const slugB = `e2e-log-b-${ts}`;
const posA = `POSA${String(ts).slice(-8)}`;
const posB = `POSB${String(ts).slice(-8)}`;

let productAId = '';
let productBId = '';
let setupVendorId = '';

async function loginAsVendorViaAdmin(page: import('@playwright/test').Page) {
  await credentialsLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForLoadState('domcontentloaded');
  const vendorId = await page.evaluate(async (impersonateId) => {
    let targetId = impersonateId;
    if (!targetId) {
      const list = await fetch('/api/v1/admin/vendors?limit=20', { credentials: 'include' });
      const json = await list.json();
      const vendors = json.data?.vendors ?? [];
      const v =
        vendors.find((x: { isActive?: boolean }) => x.isActive !== false) ?? vendors[0];
      targetId = v?.id ?? null;
    }
    if (!targetId) return null;
    await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: targetId }),
    });
    await fetch('/api/v1/auth/switch-online-store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: targetId }),
    });
    return targetId as string;
  }, setupVendorId || null);
  expect(vendorId).toBeTruthy();
  return vendorId!;
}

async function createPendingWithLogistics(
  page: import('@playwright/test').Page,
  opts: {
    name: string;
    slug: string;
    vendorSku: string;
    countryOfOrigin: string;
    shelfLifeDays: number;
  },
) {
  const categoryId = await pickLeafCategoryId(page);
  return page.evaluate(
    async (o) => {
      const res = await fetch('/api/v1/vendor/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: o.name,
          slug: o.slug,
          basePrice: 99,
          unit: 'kg',
          packSize: '1 kg',
          listingStatus: 'submitted',
          categoryIds: [o.categoryId],
          description: 'E2E logistics / POS test',
          hsn: '12345678',
          brand: 'Amul',
          imageUrl: o.imageUrl,
          countryOfOrigin: o.countryOfOrigin,
          shelfLifeDays: o.shelfLifeDays,
          vegNonVeg: 'veg',
          storageType: 'ambient',
          minOrderQty: 1,
          taxPercent: 5,
          vendorSku: o.vendorSku,
        }),
      });
      const json = await res.json();
      return {
        ok: res.ok && json.success === true,
        id: json.data?.id as string | undefined,
        error: json.error?.message as string | undefined,
        status: res.status,
      };
    },
    { ...opts, categoryId, imageUrl: TEST_IMAGE },
  );
}

async function openProductEdit(
  page: import('@playwright/test').Page,
  productId: string,
  _productName: string,
) {
  await page.goto(`/vendor/products?edit=${productId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Edit Product' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#ff-countryOfOrigin input')).toBeVisible({ timeout: 90_000 });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  setupVendorId = await loginAsVendorViaAdmin(page);

  const a = await createPendingWithLogistics(page, {
    name: productAName,
    slug: slugA,
    vendorSku: posA,
    countryOfOrigin: 'India',
    shelfLifeDays: 180,
  });
  expect(a.ok, `${a.status} ${a.error}`).toBeTruthy();
  productAId = a.id!;

  const b = await createPendingWithLogistics(page, {
    name: productBName,
    slug: slugB,
    vendorSku: posB,
    countryOfOrigin: 'India',
    shelfLifeDays: 90,
  });
  expect(b.ok, `${b.status} ${b.error}`).toBeTruthy();
  productBId = b.id!;

  await context.storageState({ path: AUTH_FILE });
  await context.close();
});

test('edit form shows country and shelf life after API save', async ({ page }) => {
  await loginAsVendorViaAdmin(page);

  const patched = await page.evaluate(
    async ({ id }) => {
      const res = await fetch(`/api/v1/vendor/products/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryOfOrigin: 'Nepal',
          shelfLifeDays: 45,
        }),
      });
      const json = await res.json();
      return {
        ok: res.ok && json.success,
        status: res.status,
        error: json.error?.message,
        data: json.data,
      };
    },
    { id: productAId },
  );
  expect(patched.ok, `${patched.status} ${patched.error}`).toBeTruthy();
  expect(patched.data?.countryOfOrigin).toBe('Nepal');
  expect(patched.data?.shelfLifeDays).toBe(45);

  await openProductEdit(page, productAId, productAName);
  await expect.poll(async () => page.locator('#ff-countryOfOrigin input').inputValue(), {
    timeout: 60_000,
  }).toBe('Nepal');
  await expect.poll(async () => page.locator('#ff-shelfLifeDays input[type="number"]').inputValue(), {
    timeout: 60_000,
  }).toBe('45');
});

test('duplicate POS SKU blocked on Update Product in vendor form', async ({ page }) => {
  await loginAsVendorViaAdmin(page);

  const apiConflict = await page.evaluate(
    async ({ id, pos }) => {
      const res = await fetch(`/api/v1/vendor/products/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorSku: pos }),
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, message: json.error?.message as string | undefined };
    },
    { id: productBId, pos: posA },
  );
  expect(apiConflict.status).toBe(409);

  await page.goto(`/vendor/products?edit=${productBId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ff-sku input')).toBeVisible({ timeout: 90_000 });

  const skuInput = page.locator('#ff-sku input');
  await expect(skuInput).toHaveValue(posB, { timeout: 15_000 });
  await skuInput.fill(posA);
  await skuInput.blur();

  const [uiPatch] = await Promise.all([
    page.waitForResponse(
      async (response) => {
        if (response.request().method() !== 'PATCH') return false;
        if (!response.url().includes(`/api/v1/vendor/products/${productBId}`)) return false;
        const postData = response.request().postDataJSON() as {
          vendorSku?: string;
          sku?: string;
        } | null;
        if (!postData) return false;
        return postData.vendorSku === posA || postData.sku === posA;
      },
      { timeout: 60_000 },
    ),
    page.locator('#vendor-product-form').evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    }),
  ]);
  expect(uiPatch.status()).toBe(409);
});

test.afterAll(async ({ browser }) => {
  if (!fs.existsSync(AUTH_FILE)) return;
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();
  await loginAsVendorViaAdmin(page);
  for (const id of [productAId, productBId].filter(Boolean)) {
    await page.evaluate(async (productId) => {
      await fetch(`/api/v1/vendor/products/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }, id);
  }
  await context.close();
  fs.rmSync(AUTH_FILE, { force: true });
});

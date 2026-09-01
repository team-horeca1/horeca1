/**
 * DiSCCO credit — full admin → vendor → customer checkout lifecycle.
 * Uses seeded users on local dev (chef / admin / Daily Fresh vendor).
 *
 * Run (dev on :3000):
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER='1'
 *   $env:AUTH_URL='http://localhost:3000'
 *   npx playwright test e2e/credit-full-flow.spec.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test';
import { credentialsLogin } from './helpers/auth';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const ADMIN = { email: 'admin@horeca1.com', password: 'admin123' };
const CUSTOMER = { email: 'chef@tajpalace.com', password: 'customer123' };
const VENDOR = { email: 'fresh@dailyfreshfoods.com', password: 'vendor123' };

type ApiJson<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
};

async function api<T = unknown>(
  page: Page,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; json: ApiJson<T> }> {
  return page.evaluate(
    async ({ url, init }) => {
      const res = await fetch(url, { credentials: 'include', ...init });
      const text = await res.text();
      if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
        throw new Error(`Expected JSON from ${url} but got HTML (status ${res.status})`);
      }
      return { status: res.status, json: JSON.parse(text) as ApiJson<T> };
    },
    { url, init },
  );
}

type WalletRow = {
  id: string;
  vendorId: string | null;
  creditLimit: string | number;
  availableCredit: string | number;
  reservedAmount?: string | number;
  outstandingAmount?: string | number;
  usedCredit?: string | number;
};

function num(v: string | number | undefined | null): number {
  return v == null ? 0 : Number(v);
}

async function customerWalletForVendor(page: Page, vendorId: string): Promise<WalletRow | null> {
  const res = await api<WalletRow[]>(page, '/api/v1/wallet');
  expect(res.status).toBe(200);
  expect(res.json.success).toBe(true);
  return (res.json.data ?? []).find((w) => w.vendorId === vendorId) ?? null;
}

async function resolveDailyFresh(page: Page) {
  const vendors = await api<{ vendors?: Array<{ id: string; slug?: string }> }>(
    page,
    '/api/v1/vendors?limit=30',
  );
  expect(vendors.status).toBe(200);
  const daily = (vendors.json.data?.vendors ?? []).find((v) => v.slug === 'daily-fresh-foods');
  expect(daily?.id, 'Daily Fresh Foods vendor must exist in seed').toBeTruthy();
  return daily!.id;
}

async function resolveCustomerUserId(page: Page) {
  await credentialsLogin(page, ADMIN.email, ADMIN.password);
  const lookup = await api<{ users?: Array<{ id: string; email: string }> }>(
    page,
    `/api/v1/admin/users?search=${encodeURIComponent(CUSTOMER.email)}&role=customer&limit=5`,
  );
  expect(lookup.status).toBe(200);
  const row = (lookup.json.data?.users ?? lookup.json.data ?? []).find?.(
    (c: { email: string }) => c.email === CUSTOMER.email,
  ) as { id: string } | undefined;
  if (!row?.id) {
    const list = lookup.json.data as { users?: Array<{ id: string; email: string }> } | Array<{ id: string; email: string }>;
    const users = Array.isArray(list) ? list : list?.users ?? [];
    const hit = users.find((c) => c.email === CUSTOMER.email);
    expect(hit?.id).toBeTruthy();
    return hit!.id;
  }
  return row.id;
}

test.describe('DiSCCO credit full lifecycle', () => {
  let vendorId = '';
  let productId = '';
  let customerUserId = '';
  let placedOrderId = '';
  let placedOrderTotal = 0;
  let cancelOrderId = '';

  test('1 — admin assigns / updates vendor credit line', async ({ page }) => {
    customerUserId = await resolveCustomerUserId(page);
    vendorId = await resolveDailyFresh(page);

    const assign = await api<WalletRow>(page, '/api/v1/admin/credit/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: customerUserId,
        vendorId,
        creditLimit: 50000,
        remark: 'E2E credit full flow assign',
      }),
    });
    expect(assign.status, assign.json.error?.message ?? 'assign failed').toBe(201);
    expect(assign.json.success).toBe(true);
    expect(num(assign.json.data?.creditLimit)).toBe(50000);
  });

  test('2 — vendor sees customer and clears past-due outstanding', async ({ page }) => {
    expect(vendorId).toBeTruthy();
    await credentialsLogin(page, VENDOR.email, VENDOR.password);
    const res = await api<{ customers?: Array<{ id: string; customer: { id: string; email: string }; outstanding: number }> }>(
      page,
      '/api/v1/vendor/credit',
    );
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    const customers = (res.json.data?.customers ?? res.json.data ?? []) as Array<{
      id: string;
      customer: { email: string };
      outstanding: number;
    }>;
    const hit = customers.find((c) => c.customer.email === CUSTOMER.email);
    expect(hit, 'vendor credit grid must list chef@tajpalace.com').toBeTruthy();

    if (hit && hit.outstanding > 0) {
      const repay = await api(page, '/api/v1/vendor/credit/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: hit.id,
          amount: hit.outstanding,
          method: 'CASH',
          note: 'E2E prep — clear stale outstanding before credit checkout test',
        }),
      });
      expect(repay.status, repay.json.error?.message ?? 'repay failed').toBeLessThan(400);
    }

    // Release reserved credit stuck on abandoned credit orders (admin force-cancel).
    await credentialsLogin(page, ADMIN.email, ADMIN.password);
    const ordersRes = await api<{ orders?: Array<{ id: string; status: string; paymentMethod?: string }> }>(
      page,
      `/api/v1/admin/orders?customerId=${customerUserId}&vendorId=${vendorId}&limit=100`,
    );
    expect(ordersRes.status).toBe(200);
    const terminal = new Set(['delivered', 'cancelled', 'returned']);
    const creditMethods = new Set(['credit', 'vendor_credit', 'discco', 'h1_wallet', 'wallet']);
    const stale = (ordersRes.json.data?.orders ?? []).filter(
      (o) => creditMethods.has(o.paymentMethod ?? '') && !terminal.has(o.status),
    );
    for (const o of stale) {
      const cancel = await api(page, `/api/v1/admin/orders/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', reason: 'E2E prep — release reserved credit' }),
      });
      expect(cancel.status, `admin cancel ${o.id}: ${cancel.json.error?.message ?? ''}`).toBeLessThan(400);
    }
  });

  test('3 — customer places credit order (reserve at checkout)', async ({ page }) => {
    expect(vendorId).toBeTruthy();
    await credentialsLogin(page, CUSTOMER.email, CUSTOMER.password);

    const walletBeforePlace = await customerWalletForVendor(page, vendorId);
    expect(walletBeforePlace).toBeTruthy();

    const catalog = await api<{ products?: Array<{ id: string; basePrice?: number; name?: string }> }>(
      page,
      `/api/v1/vendors/${vendorId}/products?limit=30`,
    );
    const products = catalog.json.data?.products ?? [];
    const pick =
      products.find((p) => num(p.basePrice) >= 600)
      ?? products.find((p) => num(p.basePrice) >= 500)
      ?? products[0];
    expect(pick?.id).toBeTruthy();
    productId = pick!.id;

    await api(page, '/api/v1/cart', { method: 'DELETE' });
    const add = await api(page, '/api/v1/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, vendorId, quantity: 1 }),
    });
    expect(add.status).toBe(201);

    const place = await api<{ orders?: Array<{ id: string; totalAmount?: number; paymentMethod?: string }> }>(
      page,
      '/api/v1/orders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'credit',
          vendorOrders: [{ vendorId, items: [{ productId, quantity: 1 }] }],
        }),
      },
    );
    expect(place.status, place.json.error?.message ?? 'order create failed').toBe(201);
    expect(place.json.success).toBe(true);
    placedOrderId = place.json.data?.orders?.[0]?.id ?? '';
    placedOrderTotal = num(place.json.data?.orders?.[0]?.totalAmount);
    expect(placedOrderId).toMatch(/^[0-9a-f-]{36}$/i);

    const walletAfterReserve = await customerWalletForVendor(page, vendorId);
    expect(walletAfterReserve).toBeTruthy();
    expect(num(walletAfterReserve!.availableCredit)).toBeLessThan(num(walletBeforePlace!.availableCredit));
    expect(num(walletAfterReserve!.reservedAmount)).toBeGreaterThan(0);
    expect(num(walletAfterReserve!.outstandingAmount)).toBe(0);
  });

  test('4 — vendor delivers → reserved converts to outstanding', async ({ page }) => {
    expect(placedOrderId).toBeTruthy();
    await credentialsLogin(page, VENDOR.email, VENDOR.password);

    for (const status of ['confirmed', 'processing', 'shipped', 'delivered'] as const) {
      const patch = await api(page, `/api/v1/orders/${placedOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      expect(patch.status, `status → ${status}: ${patch.json.error?.message ?? ''}`).toBeLessThan(400);
    }

    await credentialsLogin(page, CUSTOMER.email, CUSTOMER.password);
    const wallet = await customerWalletForVendor(page, vendorId);
    expect(wallet).toBeTruthy();
    expect(num(wallet!.outstandingAmount)).toBeGreaterThanOrEqual(placedOrderTotal);
    expect(num(wallet!.reservedAmount)).toBe(0);
  });

  test('5 — cancel second credit order releases reservation', async ({ page }) => {
    expect(vendorId && productId).toBeTruthy();
    await credentialsLogin(page, CUSTOMER.email, CUSTOMER.password);
    const before = await customerWalletForVendor(page, vendorId);
    expect(before).toBeTruthy();
    const availBefore = num(before!.availableCredit);

    await api(page, '/api/v1/cart', { method: 'DELETE' });
    await api(page, '/api/v1/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, vendorId, quantity: 1 }),
    });

    const place = await api<{ orders?: Array<{ id: string }> }>(page, '/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: 'credit',
        vendorOrders: [{ vendorId, items: [{ productId, quantity: 1 }] }],
      }),
    });
    expect(place.status, place.json.error?.message ?? 'second order failed').toBe(201);
    cancelOrderId = place.json.data?.orders?.[0]?.id ?? '';
    expect(cancelOrderId).toBeTruthy();

    await credentialsLogin(page, VENDOR.email, VENDOR.password);
    let cancel = await api(page, `/api/v1/orders/${cancelOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (cancel.status >= 400) {
      await credentialsLogin(page, ADMIN.email, ADMIN.password);
      cancel = await api(page, `/api/v1/admin/orders/${cancelOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', reason: 'E2E — release reserved credit on cancel test' }),
      });
    }
    expect(cancel.status, cancel.json.error?.message ?? 'cancel failed').toBeLessThan(400);

    await credentialsLogin(page, CUSTOMER.email, CUSTOMER.password);
    const afterCancel = await customerWalletForVendor(page, vendorId);
    expect(num(afterCancel!.availableCredit)).toBeGreaterThanOrEqual(availBefore - 1);
    expect(num(afterCancel!.reservedAmount)).toBe(0);
  });

  test('6 — admin credit list includes customer wallet', async ({ page }) => {
    expect(customerUserId && vendorId).toBeTruthy();
    await credentialsLogin(page, ADMIN.email, ADMIN.password);
    const res = await api<Array<{ userId: string; vendorId: string | null }>>(
      page,
      `/api/v1/admin/credit?search=${encodeURIComponent(CUSTOMER.email)}`,
    );
    expect(res.status).toBe(200);
    const hit = (res.json.data ?? []).find((w) => w.userId === customerUserId && w.vendorId === vendorId);
    expect(hit).toBeTruthy();
  });
});

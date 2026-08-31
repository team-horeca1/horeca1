/**
 * Admin View — storefront buyer identity.
 * Vendor impersonation must stamp buyer cookies so cart/lists/rewards/credit
 * resolve as the supplier, not the admin. Customer impersonation must do the same.
 */
import { test, expect, type Page } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

type ApiJson<T = unknown> = {
  success?: boolean;
  data?: T;
  impersonating?: { type?: string; userId?: string; businessAccountId?: string; name?: string };
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

test('vendor Admin View shops the storefront as the supplier', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  const session = await api<{ id?: string; email?: string }>(page, '/api/auth/session');
  const adminId = (session.json as { user?: { id?: string } }).user?.id
    ?? (await api<{ id?: string }>(page, '/api/v1/auth/me')).json.data?.id;
  expect(adminId).toBeTruthy();

  const started = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/admin/vendors?view=suppliers&limit=100', {
      credentials: 'include',
    });
    const listJson = await listRes.json();
    const suppliers = (listJson.data?.suppliers ?? []) as Array<{
      userId: string;
      storeCount: number;
    }>;
    const s = suppliers.find((x) => x.storeCount >= 1) ?? suppliers[0];
    if (!s?.userId) return { ok: false as const, reason: 'no-supplier' };
    const res = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierUserId: s.userId }),
    });
    return { ok: res.ok, userId: s.userId };
  });
  expect(started.ok, 'vendor impersonate should succeed').toBeTruthy();

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).toMatch(/admin_impersonate_buyer_name=/);
  expect(cookies).toMatch(/admin_impersonate_buyer_mode=vendor/);

  const me = await api<{ id?: string }>(page, '/api/v1/auth/me');
  expect(me.status).toBe(200);
  expect(me.json.impersonating?.type).toBe('vendor');
  expect(me.json.impersonating?.userId).toBeTruthy();
  expect(me.json.impersonating?.userId).not.toBe(adminId);
  expect(me.json.data?.id).toBe(me.json.impersonating?.userId);

  const lists = await api(page, '/api/v1/lists');
  expect(lists.status).toBe(200);
  expect(lists.json.success).toBe(true);

  const rewards = await api(page, '/api/v1/promotions/rewards');
  expect(rewards.status).toBe(200);
  expect(rewards.json.success).toBe(true);

  const credit = await api(page, '/api/v1/credit/check');
  expect(credit.status).toBe(200);
  expect(credit.json.success).toBe(true);

  const orders = await api<{ orders?: Array<{ userId?: string }> }>(page, '/api/v1/orders?limit=5');
  expect(orders.status).toBe(200);
  expect(orders.json.success).toBe(true);

  const cartGet = await api<{ vendorGroups?: unknown[] }>(page, '/api/v1/cart');
  // 200 with supplier cart, or 400 if they have no delivery address — never 401/403.
  expect([200, 400]).toContain(cartGet.status);

  if (cartGet.status === 200) {
    const search = await api<{ products?: Array<{ id: string; vendorId?: string }> }>(
      page,
      '/api/v1/search?q=a&limit=5',
    );
    const product = search.json.data?.products?.[0];
    const vendorId = product?.vendorId;
    if (product?.id && vendorId) {
      const add = await api(page, '/api/v1/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, vendorId, quantity: 1 }),
      });
      if (add.status === 201 || add.status === 200) {
        const after = await api<{ vendorGroups?: Array<{ items?: unknown[] }> }>(page, '/api/v1/cart');
        expect(after.status).toBe(200);
        const itemCount = (after.json.data?.vendorGroups ?? []).reduce(
          (n, g) => n + (g.items?.length ?? 0),
          0,
        );
        expect(itemCount).toBeGreaterThan(0);
        await api(page, '/api/v1/cart', { method: 'DELETE' });
      }
    }
  }

  await api(page, '/api/v1/admin/impersonate', { method: 'DELETE' });
});

test('customer Admin View scopes lists, rewards, and credit', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  const started = await page.evaluate(async () => {
    const res = await fetch('/api/v1/admin/users?role=customer&limit=20', { credentials: 'include' });
    const json = await res.json();
    const users = (json.data?.users ?? json.data ?? []) as Array<{ id: string; role?: string }>;
    const customer = users.find((u) => u.role === 'customer') ?? users[0];
    if (!customer?.id) return { ok: false as const };
    const imp = await fetch('/api/v1/admin/impersonate/customer', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: customer.id }),
    });
    return { ok: imp.ok, userId: customer.id };
  });
  expect(started.ok, 'customer impersonate should succeed').toBeTruthy();

  const me = await api<{ id?: string }>(page, '/api/v1/auth/me');
  expect(me.json.impersonating?.type).toBe('customer');
  expect(me.json.impersonating?.userId).toBe(started.userId);
  expect(me.json.data?.id).toBe(started.userId);

  const lists = await api(page, '/api/v1/lists');
  expect(lists.status).toBe(200);
  expect(lists.json.success).toBe(true);

  const rewards = await api(page, '/api/v1/promotions/rewards');
  expect(rewards.status).toBe(200);
  expect(rewards.json.success).toBe(true);

  const credit = await api(page, '/api/v1/credit/check');
  expect(credit.status).toBe(200);
  expect(credit.json.success).toBe(true);

  await api(page, '/api/v1/admin/impersonate/customer', { method: 'DELETE' });
});

const ADMIN_EMAIL = 'admin@horeca1.com';

type MeProfile = { id?: string; fullName?: string | null; email?: string | null };

async function assertNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByText('We encountered an unexpected error')).toHaveCount(0);
}

async function assertProfileShowsBuyerNotAdmin(page: Page) {
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible({ timeout: 30_000 });
  await assertNoErrorBoundary(page);

  const me = await api<MeProfile>(page, '/api/v1/auth/me');
  expect(me.status).toBe(200);
  expect(me.json.impersonating?.userId).toBeTruthy();
  expect(me.json.data?.id).toBe(me.json.impersonating?.userId);

  const buyerName = (me.json.data?.fullName || '').trim();
  const buyerEmail = (me.json.data?.email || '').trim();

  if (buyerName) {
    await expect(page.locator('h3').filter({ hasText: buyerName, visible: true })).toBeVisible();
  }
  if (buyerEmail) {
    await expect(page.getByText(buyerEmail).filter({ visible: true }).first()).toBeVisible();
    expect(buyerEmail.toLowerCase()).not.toBe(ADMIN_EMAIL);
  } else {
    await expect(page.getByText(ADMIN_EMAIL)).toHaveCount(0);
  }
}

test('vendor Admin View /profile shows supplier identity, not the admin', async ({ page }) => {
  await passwordLogin(page, ADMIN_EMAIL, 'admin123');

  const started = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/admin/vendors?view=suppliers&limit=100', {
      credentials: 'include',
    });
    const listJson = await listRes.json();
    const suppliers = (listJson.data?.suppliers ?? []) as Array<{
      userId: string;
      storeCount: number;
    }>;
    const s = suppliers.find((x) => x.storeCount >= 1) ?? suppliers[0];
    if (!s?.userId) return { ok: false as const };
    const res = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierUserId: s.userId }),
    });
    return { ok: res.ok };
  });
  expect(started.ok, 'vendor impersonate should succeed').toBeTruthy();

  await assertProfileShowsBuyerNotAdmin(page);
  await expect(page.getByText(/shopping as/i).first()).toBeVisible();

  await api(page, '/api/v1/admin/impersonate', { method: 'DELETE' });
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible({ timeout: 30_000 });
  await assertNoErrorBoundary(page);
  const after = await api<MeProfile>(page, '/api/v1/auth/me');
  expect(after.json.impersonating ?? null).toBeFalsy();
  const adminEmail = (after.json.data?.email || '').trim();
  if (adminEmail) {
    await expect(page.getByText(adminEmail).filter({ visible: true }).first()).toBeVisible();
  }
});

test('customer Admin View /profile, lists, and wallet stay scoped to the buyer', async ({ page }) => {
  await passwordLogin(page, ADMIN_EMAIL, 'admin123');

  const started = await page.evaluate(async () => {
    const res = await fetch('/api/v1/admin/users?role=customer&limit=20', { credentials: 'include' });
    const json = await res.json();
    const users = (json.data?.users ?? json.data ?? []) as Array<{ id: string; role?: string }>;
    const customer = users.find((u) => u.role === 'customer') ?? users[0];
    if (!customer?.id) return { ok: false as const };
    const imp = await fetch('/api/v1/admin/impersonate/customer', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: customer.id }),
    });
    return { ok: imp.ok };
  });
  expect(started.ok, 'customer impersonate should succeed').toBeTruthy();

  await assertProfileShowsBuyerNotAdmin(page);

  const editProfile = page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true });
  await expect(editProfile.first()).toBeVisible();
  await editProfile.first().click();
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible();
  await assertNoErrorBoundary(page);
  await page.getByRole('heading', { name: 'Edit Profile' }).locator('xpath=following-sibling::button').click();
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toHaveCount(0);

  const addresses = page.getByRole('button', { name: /Delivery Addresses|Outlets/i }).filter({ visible: true });
  await expect(addresses.first()).toBeVisible();
  await addresses.first().click();
  await assertNoErrorBoundary(page);

  await page.goto('/order-lists', { waitUntil: 'domcontentloaded' });
  await assertNoErrorBoundary(page);

  await page.goto('/wallet', { waitUntil: 'domcontentloaded' });
  await assertNoErrorBoundary(page);

  await api(page, '/api/v1/admin/impersonate/customer', { method: 'DELETE' });
});

test('brand Admin View /profile shows brand buyer identity when a customer BA exists', async ({ page }) => {
  await passwordLogin(page, ADMIN_EMAIL, 'admin123');

  const started = await page.evaluate(async () => {
    const res = await fetch('/api/v1/admin/brands', { credentials: 'include' });
    const json = await res.json();
    const brands = (json.data ?? []) as Array<{ id: string; user?: { id?: string } | null; userId?: string }>;
    const brand = brands.find((b) => b.user?.id || b.userId);
    if (!brand?.id) return { ok: false as const, reason: 'no-brand' };
    const imp = await fetch('/api/v1/admin/impersonate/brand', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: brand.id }),
    });
    return { ok: imp.ok };
  });
  expect(started.ok, 'brand impersonate should succeed').toBeTruthy();

  const me = await api<MeProfile>(page, '/api/v1/auth/me');
  if (!me.json.impersonating?.userId) {
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundary(page);
    await api(page, '/api/v1/admin/impersonate/brand', { method: 'DELETE' });
    return;
  }

  await assertProfileShowsBuyerNotAdmin(page);
  await expect(page.getByRole('link', { name: /back to brand portal/i })).toBeVisible();

  await api(page, '/api/v1/admin/impersonate/brand', { method: 'DELETE' });
});

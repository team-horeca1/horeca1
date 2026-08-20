/**
 * Promo Engine Phase 1 — Playwright Chromium + security cases.
 *
 * Coverage (plan phase-e-tests-report):
 *  - UI: homepage Deals card, /deals, vendor header Deals & Coupons,
 *    campaign modal has no UPI destination, payout claim is Name + UPI only,
 *    /r/ stays return-pickup, /invite/ is referral.
 *  - Coupons via admin create + customer preview: flat/%, MOV, dates, usage,
 *    per-user, vendor/product/category/brand scope, one coupon, audience.
 *  - Cashback: one winner (preview), wallet dest coerced, stacking flags,
 *    delivery settle + duplicate settle + cancel (when checkout works).
 *  - Ownership: vendor cannot create platform-wide or another vendor's
 *    products/categories/brands; customer cannot send discount amounts.
 *  - Programs: welcome once; first-order not fooled by unused coupon;
 *    referral no self / no reassignment; payout amount not client-trusted.
 *
 * Math (BXGY suppression, proportional split, Rule 2/5/6) lives in
 * prisma/scripts/test-promo-math.ts — run that harness alongside this file.
 */
import { test, expect, type Page } from '@playwright/test';
import { credentialsLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 180_000 });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const RUN = `P1${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`;

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
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await page.evaluate(
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
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(400 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function dismissOverlays(page: Page) {
  await page.keyboard.press('Escape').catch(() => {});
  for (const name of [/Go Without Location/i, /Skip for now/i, /Maybe later/i, /^Cancel$/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
    }
  }
}

async function enterStore(page: Page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });
}

function uniquePhone() {
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `9${tail}`;
}

type CatalogHit = {
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  productId: string;
  categoryId: string | null;
  brand: string | null;
  unitPrice: number;
  qty: number;
};

async function pickCatalog(page: Page): Promise<CatalogHit | null> {
  return page.evaluate(async () => {
    const list = await (await fetch('/api/v1/vendors?limit=10', { credentials: 'include' })).json();
    const vendors = (list.data?.vendors ?? []) as Array<{
      id: string;
      slug?: string;
      businessName?: string;
      minOrderValue?: number;
    }>;
    for (const v of vendors) {
      const prodRes = await fetch(`/api/v1/vendors/${v.id}/products?limit=20`, { credentials: 'include' });
      const prodJson = await prodRes.json();
      const products = (prodJson.data?.products ?? prodJson.data ?? []) as Array<{
        id: string;
        categoryId?: string | null;
        brand?: string | { name?: string } | null;
        basePrice?: number;
        price?: number;
        isActive?: boolean;
      }>;
      const p = products.find((row) => row.isActive !== false) ?? products[0];
      if (!p?.id) continue;
      const brand =
        typeof p.brand === 'string' ? p.brand : p.brand && typeof p.brand === 'object' ? p.brand.name ?? null : null;
      const unit = Number(p.basePrice ?? p.price ?? 50) || 50;
      const mov = Number(v.minOrderValue ?? 500);
      const qty = Math.max(2, Math.ceil((mov + 50) / Math.max(unit, 1)));
      return {
        vendorId: v.id,
        vendorSlug: v.slug ?? v.id,
        vendorName: v.businessName ?? 'Store',
        productId: p.id,
        categoryId: p.categoryId ?? null,
        brand,
        unitPrice: unit,
        qty,
      };
    }
    return null;
  });
}

async function signupCustomer(page: Page, opts?: { cookieToken?: string }) {
  const email = `e2e.${RUN}.${Math.floor(Math.random() * 1e6)}@horeca1.test`;
  const password = 'customer123';
  const phone = uniquePhone();
  let last: { status: number; json: ApiJson<{ id?: string }> } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      last = await page.evaluate(
        async ({ email, password, phone, cookieToken }) => {
          if (cookieToken) {
            await fetch(`/api/v1/promotions/invite/${encodeURIComponent(cookieToken)}`, { credentials: 'include' });
          }
          const r = await fetch('/api/v1/auth/signup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              fullName: 'E2E Promo User',
              phone,
              role: 'customer',
              pincode: '400705',
              businessName: 'E2E Promo Kitchen',
            }),
          });
          return { status: r.status, json: (await r.json()) as ApiJson<{ id?: string }> };
        },
        { email, password, phone, cookieToken: opts?.cookieToken ?? null },
      );
      if (last.status !== 429 && last.status < 500) {
        return { email, password, phone, ...last };
      }
    } catch {
      /* webpack compile / brief disconnect */
    }
    await page.waitForTimeout(1500 * (attempt + 1));
  }
  return { email, password, phone, ...(last ?? { status: 0, json: {} }) };
}

async function completeBuyerOutletAddress(page: Page, pincode = '400705') {
  const result = await page.evaluate(async (pin) => {
    const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
    const baId = session?.user?.activeBusinessAccountId as string | undefined;
    const outletId = session?.user?.activeOutletId as string | undefined;
    if (!baId || !outletId) return { ok: false as const, error: 'missing ba/outlet on session' };
    const res = await fetch(`/api/v1/account/${baId}/outlets/${outletId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addressLine: 'E2E Promo Address, Navi Mumbai',
        city: 'Navi Mumbai',
        state: 'Maharashtra',
        pincode: pin,
        latitude: 19.033,
        longitude: 73.0297,
        requiresAddressUpdate: false,
      }),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null;
    const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json();
    await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csrfToken: csrf.csrfToken,
        data: { refresh: Date.now(), activeOutletId: outletId },
      }),
    });
    return {
      ok: (res.ok && json?.success !== false) as boolean,
      error: json?.error?.message,
    };
  }, pincode);
  expect(result.ok, result.error ?? 'outlet address complete failed').toBe(true);
}

async function pollRewards(
  page: Page,
  pred: (data: {
    walletBalance?: number;
    entries?: Array<{ source?: string; status?: string; amount?: unknown; campaign?: { name?: string } | null }>;
    walletTransactions?: Array<{ referenceType?: string | null; amount?: unknown; type?: string }>;
  }) => boolean,
  timeoutMs = 45_000,
) {
  const start = Date.now();
  let last: unknown = null;
  while (Date.now() - start < timeoutMs) {
    const res = await api<{
      walletBalance?: number;
      entries?: Array<{ source?: string; status?: string; amount?: unknown; campaign?: { name?: string } | null }>;
      walletTransactions?: Array<{ referenceType?: string | null; amount?: unknown; type?: string }>;
    }>(page, '/api/v1/promotions/rewards');
    last = res.json.data;
    if (res.json.success && res.json.data && pred(res.json.data)) return res.json.data;
    await page.waitForTimeout(500);
  }
  throw new Error(`Rewards poll timed out. Last: ${JSON.stringify(last)}`);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  } finally {
    await page.close();
  }
});

// ── UI ─────────────────────────────────────────────────────────────────────

test.describe('Phase 1 UI', () => {
  test('homepage Deals card and /deals page', async ({ page }) => {
    await credentialsLogin(page, 'chef@tajpalace.com', 'customer123');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    const deals = page.getByRole('link', { name: /Deals & Discounts/i }).first();
    await expect(deals).toBeVisible({ timeout: 30_000 });
    await expect(deals).toHaveAttribute('href', '/deals');
    await page.goto('/deals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Deals & Discounts/i })).toBeVisible();
    await expect(page.getByText(/Copy a code and apply it at checkout/i)).toBeVisible();
    // Cashback face values must never look like a guaranteed credit (BUG-UX-001).
    const cashbackBadges = page.getByText(/cashback/i);
    const n = await cashbackBadges.count();
    for (let i = 0; i < n; i += 1) {
      const text = (await cashbackBadges.nth(i).innerText()).trim();
      if (/^\d+%?\s*cashback/i.test(text) || /^₹\d[\d,]*\s*cashback/i.test(text)) {
        expect(text, `misleading cashback badge: ${text}`).toMatch(/^Up to\b/i);
      }
    }
  });

  test('vendor store header opens Deals & Coupons sheet', async ({ page }) => {
    // Desktop Chrome is md+ so the first "Deals & Coupons" node is the mobile
    // pill (display:none). Assert the visible desktop CTA, not .first().
    await page.setViewportSize({ width: 1400, height: 900 });
    await credentialsLogin(page, 'chef@tajpalace.com', 'customer123');
    const catalog = await pickCatalog(page);
    test.skip(!catalog, 'No catalog vendor/product');
    await page.goto(`/vendor/${catalog!.vendorId}`, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await expect(page.getByText('Loading store...')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByText('Vendor not found')).toHaveCount(0);
    const cta = page.getByRole('button', { name: 'Deals & Coupons' }).filter({ visible: true });
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await cta.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /platform/i })).toBeVisible();
  });

  test('admin campaign modal has no UPI destination option', async ({ page }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    await page.goto('/admin/promotions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Promotions$/i })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Cashback Campaigns$/i }).click();
    await expect(page.getByRole('button', { name: /New Campaign/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /New Campaign/i }).click();
    const modal = page.getByRole('heading', { name: /New Cashback Campaign/i });
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Credits the customer's H1 Wallet after delivery/i)).toBeVisible();
    const dest = page.locator('select, option, label').filter({ hasText: /^UPI$/i });
    await expect(dest).toHaveCount(0);
    await expect(page.getByRole('option', { name: /UPI/i })).toHaveCount(0);
  });

  test('vendor campaign modal has no UPI destination option', async ({ page }) => {
    await credentialsLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
    await page.goto('/vendor/promotions', { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await expect(page.getByRole('button', { name: /^Cashback$/i })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Cashback$/i }).click();
    // Tab remounts while campaigns load — wait for the section heading, then click.
    await expect(page.getByRole('heading', { name: /Cashback Campaigns/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /New Campaign/i }).click({ force: true });
    await expect(page.getByRole('heading', { name: /New Cashback Campaign/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Credits the customer's H1 Wallet after delivery/i)).toBeVisible();
    await expect(page.getByRole('option', { name: /UPI/i })).toHaveCount(0);
  });

  test('/r/ is still return-pickup', async ({ page }) => {
    await page.goto('/r/not-a-real-return-token-abc', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Return pickup/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/invited you/i)).toHaveCount(0);
  });

  test('/invite/ is referral, not return-pickup', async ({ page }) => {
    await credentialsLogin(page, 'chef@tajpalace.com', 'customer123');
    const referral = await api<{ token: string; inviteUrl: string; invitePath?: string }>(
      page,
      '/api/v1/promotions/referral',
    );
    expect(referral.json.success).toBe(true);
    const token = referral.json.data?.token;
    expect(token && token.length >= 16).toBe(true);
    expect(referral.json.data?.inviteUrl).toMatch(/\/invite\//);
    // BUG-UI-002: invite must use the request/app origin, not a hard-coded :3001.
    const expectedOrigin = new URL(BASE).origin;
    expect(referral.json.data?.inviteUrl?.startsWith(`${expectedOrigin}/invite/`)).toBe(true);
    if (referral.json.data?.invitePath) {
      expect(referral.json.data.invitePath).toBe(`/invite/${token}`);
    }

    const click = await api<{ token: string; referrerName?: string }>(page, `/api/v1/promotions/invite/${token}`);
    expect(click.json.success, click.json.error?.message).toBe(true);
    expect(click.json.data?.token).toBe(token);

    await page.goto(`/invite/${token}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/invited you|Create your HoReCa Hub account|Opening your invite/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/Return pickup/i)).toHaveCount(0);
  });

  test('payout claim page is Name + UPI ID only', async ({ page }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const created = await api<{ token: string; amount: unknown; claimUrl?: string }>(
      page,
      '/api/v1/admin/promotions/payout-invites',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 142, notes: `e2e ${RUN} ui`, expiresInDays: 1 }),
      },
    );
    expect(created.status, created.json.error?.message).toBe(201);
    const token = created.json.data?.token;
    expect(token).toBeTruthy();

    await page.goto(`/payout/${token}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/You are claiming/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    await expect(page.getByText('UPI ID', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('name@upi')).toBeVisible();
    await expect(page.locator('input[type="number"], input[name="amount"]')).toHaveCount(0);
    await expect(page.getByText(/amount cannot be changed/i)).toBeVisible();
  });
});

// ── Security / ownership ───────────────────────────────────────────────────

test.describe('Phase 1 security', () => {
  test('vendor cannot create a platform-wide coupon or scope another vendor catalog', async ({ page }) => {
    await credentialsLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
    await page.goto('/vendor/promotions', { waitUntil: 'domcontentloaded' });

    const me = await api<{ id: string }>(page, '/api/v1/vendor/settings');
    const vendorId = me.json.data?.id;
    expect(vendorId).toBeTruthy();

    const code = `E2E${RUN}V`.slice(0, 20);
    const created = await api<{ id: string; vendorId: string | null; code: string }>(page, '/api/v1/vendor/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        name: 'E2E vendor coupon',
        discountType: 'flat',
        discountValue: 10,
        vendorId: null,
      }),
    });
    expect(created.status, created.json.error?.message).toBe(201);
    expect(created.json.data?.vendorId).toBe(vendorId);
    expect(created.json.data?.vendorId).not.toBeNull();

    const steal = await page.evaluate(
      async ({ vendorId, code }) => {
        const list = await (await fetch('/api/v1/vendors?limit=20', { credentials: 'include' })).json();
        const vendors = (list.data?.vendors ?? []) as Array<{ id: string }>;
        const other = vendors.find((v) => v.id !== vendorId);
        let foreignProductId: string | null = null;
        if (other) {
          const prodJson = await (await fetch(`/api/v1/vendors/${other.id}/products?limit=10`, { credentials: 'include' })).json();
          const products = (prodJson.data?.products ?? prodJson.data ?? []) as Array<{ id: string }>;
          foreignProductId = products[0]?.id ?? null;
        }
        const post = async (body: Record<string, unknown>) => {
          const res = await fetch('/api/v1/vendor/coupons', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { status: res.status, json: await res.json() };
        };
        const stealProduct = foreignProductId
          ? await post({
              code: `${code}P`,
              name: 'steal product',
              discountType: 'flat',
              discountValue: 10,
              productIds: [foreignProductId],
            })
          : null;
        const stealCat = await post({
          code: `${code}C`,
          name: 'steal category',
          discountType: 'flat',
          discountValue: 10,
          categoryIds: ['00000000-0000-4000-8000-000000000001'],
        });
        const stealBrand = await post({
          code: `${code}B`,
          name: 'steal brand',
          discountType: 'flat',
          discountValue: 10,
          brandNames: ['Definitely-Not-In-This-Store-Brand-XYZ'],
        });
        return { stealProduct, stealCat, stealBrand };
      },
      { vendorId: vendorId!, code },
    );

    if (steal.stealProduct) {
      expect(steal.stealProduct.json.success).toBeFalsy();
      expect(steal.stealProduct.status).toBeGreaterThanOrEqual(400);
      expect(String(steal.stealProduct.json.error?.message ?? '')).toMatch(/do not belong/i);
    }
    expect(steal.stealCat.json.success).toBeFalsy();
    expect(String(steal.stealCat.json.error?.message ?? '')).toMatch(/not in your catalog/i);
    expect(steal.stealBrand.json.success).toBeFalsy();
    expect(String(steal.stealBrand.json.error?.message ?? '')).toMatch(/not in your catalog/i);

    if (created.json.data?.id) {
      await api(page, `/api/v1/vendor/coupons/${created.json.data.id}`, { method: 'DELETE' });
    }
  });

  test('vendor cannot persist audience targeting; customer cannot mint coupons or send discount amounts', async ({
    page,
    browser,
  }) => {
    await credentialsLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
    await page.goto('/vendor/promotions', { waitUntil: 'domcontentloaded' });
    const code = `E2E${RUN}A`.slice(0, 20);
    const created = await api<{ id: string; audienceUserIds?: string[] }>(page, '/api/v1/vendor/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        name: 'E2E no audience',
        discountType: 'flat',
        discountValue: 10,
        audienceUserIds: ['00000000-0000-4000-8000-000000000099'],
      }),
    });
    expect(created.status, created.json.error?.message).toBe(201);
    expect(created.json.data?.audienceUserIds ?? []).toEqual([]);

    const customer = await browser.newContext({ baseURL: BASE });
    const customerPage = await customer.newPage();
    await credentialsLogin(customerPage, 'chef@tajpalace.com', 'customer123');

    const adminPost = await api(customerPage, '/api/v1/admin/promotions/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `${code}X`,
        name: 'stolen',
        discountType: 'flat',
        discountValue: 9999,
      }),
    });
    expect(adminPost.status).toBeGreaterThanOrEqual(401);

    const catalog = await pickCatalog(customerPage);
    test.skip(!catalog, 'No catalog to place a draft');
    let draft: { status: number; json: ApiJson<{ orders?: Array<{ promoDiscount?: unknown; couponDiscount?: unknown; totalAmount?: unknown }> }> } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      draft = await api<{
        orders?: Array<{ promoDiscount?: unknown; couponDiscount?: unknown; totalAmount?: unknown }>;
      }>(customerPage, '/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'cod',
          saveDraft: true,
          couponDiscount: 9999,
          promoDiscount: 9999,
          totalAmount: 1,
          discountAmount: 9999,
          vendorOrders: [{ vendorId: catalog!.vendorId, items: [{ productId: catalog!.productId, quantity: catalog!.qty }] }],
        }),
      });
      if (draft.json.success) break;
      if (!/too long|rolled back|serializ/i.test(draft.json.error?.message ?? '')) break;
      await customerPage.waitForTimeout(1500 * (attempt + 1));
    }
    expect(draft?.json.success, draft?.json.error?.message).toBe(true);
    const order = draft?.json.data?.orders?.[0];
    expect(Number(order?.couponDiscount ?? 0)).toBe(0);
    expect(Number(order?.promoDiscount ?? 0)).toBe(0);
    expect(Number(order?.totalAmount ?? 0)).toBeGreaterThan(1);

    if (created.json.data?.id) {
      await api(page, `/api/v1/vendor/coupons/${created.json.data.id}`, { method: 'DELETE' });
    }
    await customer.close();
  });

  test('new/updated campaigns coerce destination to wallet even if body says upi', async ({ page }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const created = await api<{ id: string; destination: string }>(page, '/api/v1/admin/promotions/cashback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `E2E ${RUN} dest`,
        cashbackType: 'flat',
        cashbackValue: 11,
        destination: 'upi',
        isActive: false,
      }),
    });
    expect(created.status, created.json.error?.message).toBe(201);
    expect(created.json.data?.destination).toBe('wallet');

    const patched = await api<{ destination: string }>(page, `/api/v1/admin/promotions/cashback/${created.json.data!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'upi', name: `E2E ${RUN} dest patched` }),
    });
    expect(patched.json.success).toBe(true);
    expect(patched.json.data?.destination).toBe('wallet');
  });

  test('payout invite amount is not client-trusted; double-claim and CSRF origin are rejected', async ({ page }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const created = await api<{ token: string; amount: unknown }>(page, '/api/v1/admin/promotions/payout-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 137, notes: `e2e ${RUN} tamper`, expiresInDays: 1 }),
    });
    expect(created.status, created.json.error?.message).toBe(201);
    const token = created.json.data!.token;

    const csrf = await page.request.post(`${BASE}/api/v1/promotions/payout/${token}`, {
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      data: { name: 'Eve', upiId: 'eve@upi', amount: 99999 },
    });
    expect(csrf.status()).toBe(403);

    const claim = await page.request.post(`${BASE}/api/v1/promotions/payout/${token}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Maya Rao', upiId: 'maya@okaxis', amount: 99999 },
    });
    const claimJson = await claim.json();
    expect(claim.status(), JSON.stringify(claimJson.error ?? claimJson)).toBe(200);
    expect(claimJson.success).toBe(true);
    expect(Number(claimJson.data?.amount)).toBe(137);

    const preview = await page.request.get(`${BASE}/api/v1/promotions/payout/${token}`);
    const previewJson = await preview.json();
    expect(previewJson.data?.claimed).toBe(true);
    expect(Number(previewJson.data?.amount)).toBe(137);

    const again = await page.request.post(`${BASE}/api/v1/promotions/payout/${token}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Maya Rao', upiId: 'maya@okaxis' },
    });
    const againJson = await again.json();
    expect(againJson.success).toBeFalsy();
    expect(String(againJson.error?.message ?? '')).toMatch(/already been claimed/i);
  });
});

// ── Coupon + cashback APIs ─────────────────────────────────────────────────

test.describe('Phase 1 coupon + cashback APIs', () => {
  test('admin coupons: flat/%, MOV, dates, usage, per-user, scope, audience, one coupon', async ({ page, browser }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const catalog = await pickCatalog(page);
    test.skip(!catalog, 'No catalog');

    const chef = await api<{ users?: Array<{ id: string; email?: string | null }> }>(
      page,
      '/api/v1/admin/users?search=chef@tajpalace.com&limit=5',
    );
    const chefId = chef.json.data?.users?.find((u) => u.email === 'chef@tajpalace.com')?.id;
    expect(chefId).toBeTruthy();

    const prefix = `E2E${RUN}`.slice(0, 12);
    const make = async (body: Record<string, unknown>) =>
      api<{ id: string; code: string }>(page, '/api/v1/admin/promotions/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const flat = await make({
      code: `${prefix}F`,
      name: 'E2E flat',
      discountType: 'flat',
      discountValue: 50,
      isActive: true,
    });
    expect(flat.status, flat.json.error?.message).toBe(201);

    const pct = await make({
      code: `${prefix}P`,
      name: 'E2E pct',
      discountType: 'percentage',
      discountValue: 10,
      maxDiscount: 40,
      isActive: true,
    });
    expect(pct.status, pct.json.error?.message).toBe(201);

    const mov = await make({
      code: `${prefix}M`,
      name: 'E2E mov',
      discountType: 'flat',
      discountValue: 20,
      minOrderValue: 9_999_999,
      isActive: true,
    });
    expect(mov.status, mov.json.error?.message).toBe(201);

    const expired = await make({
      code: `${prefix}E`,
      name: 'E2E expired',
      discountType: 'flat',
      discountValue: 20,
      endDate: new Date(Date.now() - 86_400_000).toISOString(),
      isActive: true,
    });
    expect(expired.status, expired.json.error?.message).toBe(201);

    const audience = await make({
      code: `${prefix}T`,
      name: 'E2E targeted',
      discountType: 'flat',
      discountValue: 15,
      audienceUserIds: ['00000000-0000-4000-8000-000000000077'],
      isActive: true,
    });
    expect(audience.status, audience.json.error?.message).toBe(201);

    const scoped = await make({
      code: `${prefix}S`,
      name: 'E2E scoped',
      discountType: 'percentage',
      discountValue: 10,
      productIds: [catalog!.productId],
      isActive: true,
    });
    expect(scoped.status, scoped.json.error?.message).toBe(201);

    const future = await make({
      code: `${prefix}W`,
      name: 'E2E future',
      discountType: 'flat',
      discountValue: 20,
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
      isActive: true,
    });
    expect(future.status, future.json.error?.message).toBe(201);

    const exhausted = await make({
      code: `${prefix}U`,
      name: 'E2E usage',
      discountType: 'flat',
      discountValue: 20,
      usageLimit: 1,
      isActive: true,
    });
    expect(exhausted.status, exhausted.json.error?.message).toBe(201);

    const perUser = await make({
      code: `${prefix}L`,
      name: 'E2E per-user',
      discountType: 'flat',
      discountValue: 20,
      perUserLimit: 1,
      isActive: true,
    });
    expect(perUser.status, perUser.json.error?.message).toBe(201);

    const catScoped = catalog!.categoryId
      ? await make({
          code: `${prefix}C`,
          name: 'E2E category',
          discountType: 'percentage',
          discountValue: 5,
          categoryIds: [catalog!.categoryId],
          isActive: true,
        })
      : null;
    if (catScoped) expect(catScoped.status, catScoped.json.error?.message).toBe(201);

    const brandScoped = catalog!.brand
      ? await make({
          code: `${prefix}B`,
          name: 'E2E brand',
          discountType: 'percentage',
          discountValue: 5,
          brandNames: [catalog!.brand],
          isActive: true,
        })
      : null;
    if (brandScoped) expect(brandScoped.status, brandScoped.json.error?.message).toBe(201);

    const ids = [flat, pct, mov, expired, audience, scoped, future, exhausted, perUser, catScoped, brandScoped]
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => r.json.data?.id)
      .filter((id): id is string => Boolean(id));

    const customerCtx = await browser.newContext({ baseURL: BASE });
    const customerPage = await customerCtx.newPage();
    await credentialsLogin(customerPage, 'chef@tajpalace.com', 'customer123');

    const preview = async (code: string, extra?: Record<string, unknown>) =>
      api<{
        coupon: { valid: boolean; estimatedDiscount?: number; message?: string } | null;
        estimatedCashback: { estimatedAmount: number; destination: string; settlesOn: string; campaignName?: string } | null;
      }>(customerPage, '/api/v1/promotions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: catalog!.productId, vendorId: catalog!.vendorId, quantity: catalog!.qty }],
          code,
          ...extra,
        }),
      });

    const flatPrev = await preview(`${prefix}F`);
    expect(flatPrev.json.success, flatPrev.json.error?.message).toBe(true);
    expect(flatPrev.json.data?.coupon?.valid).toBe(true);
    expect(Number(flatPrev.json.data?.coupon?.estimatedDiscount)).toBe(50);

    const pctPrev = await preview(`${prefix}P`);
    expect(pctPrev.json.data?.coupon?.valid).toBe(true);
    expect(Number(pctPrev.json.data?.coupon?.estimatedDiscount)).toBeLessThanOrEqual(40);

    const movPrev = await preview(`${prefix}M`);
    expect(movPrev.json.data?.coupon?.valid).toBe(false);
    expect(movPrev.json.data?.coupon?.message ?? '').toMatch(/99,99,999|9,999,999|9999999/i);

    const expiredPrev = await preview(`${prefix}E`);
    expect(expiredPrev.json.data?.coupon?.valid).toBe(false);
    expect(expiredPrev.json.data?.coupon?.message ?? '').toMatch(/expired/i);

    const audiencePrev = await preview(`${prefix}T`);
    expect(audiencePrev.json.data?.coupon?.valid).toBe(false);
    expect(audiencePrev.json.data?.coupon?.message ?? '').toMatch(/not available/i);

    const scopedPrev = await preview(`${prefix}S`);
    expect(scopedPrev.json.data?.coupon?.valid).toBe(true);

    const futurePrev = await preview(`${prefix}W`);
    expect(futurePrev.json.data?.coupon?.valid).toBe(false);
    expect(futurePrev.json.data?.coupon?.message ?? '').toMatch(/not active yet/i);

    const usagePrev = await preview(`${prefix}U`);
    expect(usagePrev.json.data?.coupon?.valid).toBe(true);

    const perUserPrev = await preview(`${prefix}L`);
    expect(perUserPrev.json.data?.coupon?.valid).toBe(true);

    if (catalog!.categoryId) {
      const catPrev = await preview(`${prefix}C`);
      expect(catPrev.json.data?.coupon?.valid).toBe(true);
    }
    if (catalog!.brand) {
      const brandPrev = await preview(`${prefix}B`);
      expect(brandPrev.json.data?.coupon?.valid).toBe(true);
    }

    const missing = await preview('NOPECODE999');
    expect(missing.json.data?.coupon?.valid).toBe(false);

    // Rule 1 — preview prices exactly one code; a second extra field is ignored.
    const stacked = await preview(`${prefix}F`, { couponCodes: [`${prefix}P`], extraCode: `${prefix}P` });
    expect(stacked.json.data?.coupon?.valid).toBe(true);
    expect(Number(stacked.json.data?.coupon?.estimatedDiscount)).toBe(50);

    const offers = await api<{ coupons: Array<{ code: string; vendorId: string | null }> }>(
      customerPage,
      `/api/v1/promotions/offers?vendorId=${catalog!.vendorId}`,
    );
    expect(offers.json.success).toBe(true);
    const leaked = (offers.json.data?.coupons ?? []).filter(
      (c) => c.vendorId && c.vendorId !== catalog!.vendorId,
    );
    expect(leaked).toHaveLength(0);

    for (const id of ids) {
      await api(page, `/api/v1/admin/promotions/coupons/${id}`, { method: 'DELETE' });
    }
    await customerCtx.close();
  });

  test('preview cashback is one winner, wallet dest, stacking flags, server-computed', async ({ page, browser }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const catalog = await pickCatalog(page);
    test.skip(!catalog, 'No catalog');

    const campaign = await api<{ id: string; destination: string; name: string }>(page, '/api/v1/admin/promotions/cashback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `E2E ${RUN} CBWIN`,
        cashbackType: 'flat',
        cashbackValue: 8888,
        destination: 'upi',
        stacksWithCoupon: true,
        stacksWithWallet: true,
        isActive: true,
        perUserLimit: 1,
      }),
    });
    expect(campaign.status, campaign.json.error?.message).toBe(201);
    expect(campaign.json.data?.destination).toBe('wallet');

    const blocker = await api<{ id: string; code: string }>(page, '/api/v1/admin/promotions/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `E2E${RUN}K`.slice(0, 20),
        name: 'E2E blocks cashback',
        discountType: 'flat',
        discountValue: 10,
        stacksWithCashback: false,
        stacksWithWallet: false,
        isActive: true,
      }),
    });
    expect(blocker.status, blocker.json.error?.message).toBe(201);

    const customer = await browser.newContext({ baseURL: BASE });
    try {
      const customerPage = await customer.newPage();
      await credentialsLogin(customerPage, 'chef@tajpalace.com', 'customer123');

    const open = await api<{
      estimatedCashback: {
        estimatedAmount: number;
        destination: string;
        settlesOn: string;
        campaignName?: string;
      } | null;
      coupon: { valid: boolean; stacksWithWallet?: boolean } | null;
    }>(customerPage, '/api/v1/promotions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: catalog!.productId, vendorId: catalog!.vendorId, quantity: catalog!.qty }],
      }),
    });
    expect(open.json.success, open.json.error?.message).toBe(true);
    expect(open.json.data?.estimatedCashback).toBeTruthy();
    expect(open.json.data?.estimatedCashback?.destination).toBe('wallet');
    expect(open.json.data?.estimatedCashback?.settlesOn).toBe('delivery');
    expect(Number(open.json.data?.estimatedCashback?.estimatedAmount)).toBeGreaterThan(0);
    // Flat 8888 is capped at goods base; the winner is still this campaign when it is the max.
    if (Number(open.json.data?.estimatedCashback?.estimatedAmount) === 8888) {
      expect(open.json.data?.estimatedCashback?.campaignName).toMatch(/CBWIN/);
    }

    const blocked = await api<{ estimatedCashback: unknown; coupon: { valid: boolean } | null }>(
      customerPage,
      '/api/v1/promotions/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: catalog!.productId, vendorId: catalog!.vendorId, quantity: catalog!.qty }],
          code: blocker.json.data!.code,
        }),
      },
    );
    expect(blocked.json.data?.coupon?.valid).toBe(true);
    expect(blocked.json.data?.estimatedCashback).toBeNull();
    } finally {
      if (campaign.json.data?.id) {
        await api(page, `/api/v1/admin/promotions/cashback/${campaign.json.data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        });
      }
      if (blocker.json.data?.id) {
        await api(page, `/api/v1/admin/promotions/coupons/${blocker.json.data.id}`, { method: 'DELETE' });
      }
      await customer.close();
    }
  });
});

// ── Programs: welcome / first-order / referral ─────────────────────────────

test.describe('Phase 1 programs', () => {
  test.describe.configure({ timeout: 240_000 });
  test('welcome issues once; first-order is not fooled by an unused coupon; cashback settle/cancel', async ({
    page,
    browser,
  }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');

    const prevWelcome = await api<{
      isActive: boolean;
      rewardType: string;
      rewardValue: unknown;
      minOrderValue?: unknown;
      validDays?: unknown;
      maxDiscount?: unknown;
    } | null>(page, '/api/v1/admin/promotions/programs/welcome');
    const prevFirst = await api<{
      isActive: boolean;
      rewardType: string;
      rewardValue: unknown;
      minOrderValue?: unknown;
      validDays?: unknown;
      maxDiscount?: unknown;
    } | null>(page, '/api/v1/admin/promotions/programs/first-order');

    const restore = async () => {
      const w = prevWelcome.json.data;
      await api(page, '/api/v1/admin/promotions/programs/welcome', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          w
            ? {
                isActive: w.isActive,
                rewardType: w.rewardType,
                rewardValue: Number(w.rewardValue) || 1,
                minOrderValue: w.minOrderValue == null ? null : Number(w.minOrderValue),
                validDays: w.validDays == null ? null : Number(w.validDays),
                maxDiscount: w.maxDiscount == null ? null : Number(w.maxDiscount),
              }
            : { isActive: false, rewardType: 'wallet_credit', rewardValue: 1 },
        ),
      });
      const f = prevFirst.json.data;
      await api(page, '/api/v1/admin/promotions/programs/first-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          f
            ? {
                isActive: f.isActive,
                rewardType: f.rewardType === 'free_delivery' ? 'wallet_credit' : f.rewardType,
                rewardValue: Number(f.rewardValue) || 1,
                minOrderValue: f.minOrderValue == null ? null : Number(f.minOrderValue),
                validDays: f.validDays == null ? null : Number(f.validDays),
                maxDiscount: f.maxDiscount == null ? null : Number(f.maxDiscount),
              }
            : { isActive: false, rewardType: 'wallet_credit', rewardValue: 1 },
        ),
      });
    };

    try {
      const welcomeOn = await api(page, '/api/v1/admin/promotions/programs/welcome', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true, rewardType: 'wallet_credit', rewardValue: 17 }),
      });
      expect(welcomeOn.json.success, welcomeOn.json.error?.message).toBe(true);

      const firstOn = await api(page, '/api/v1/admin/promotions/programs/first-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true, rewardType: 'wallet_credit', rewardValue: 23 }),
      });
      expect(firstOn.json.success, firstOn.json.error?.message).toBe(true);

      const campaign = await api<{ id: string }>(page, '/api/v1/admin/promotions/cashback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `E2E ${RUN} LIFE`,
          cashbackType: 'flat',
          cashbackValue: 19,
          isActive: true,
          perUserLimit: 5,
        }),
      });
      expect(campaign.status, campaign.json.error?.message).toBe(201);

      const signed = await signupCustomer(page);
      expect(signed.status, signed.json.error?.message).toBe(201);
      const userId = (signed.json.data as { id?: string } | undefined)?.id;
      expect(userId).toBeTruthy();
      // Let UserRegistered → welcome issuance finish before buyer login contends for the pool.
      await page.waitForTimeout(1_500);

      const unused = await api<{ id: string; usedCount?: number }>(page, '/api/v1/admin/promotions/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `E2E${RUN}N`.slice(0, 20),
          name: 'E2E unused decoy',
          discountType: 'flat',
          discountValue: 50,
          audienceUserIds: [userId],
          isActive: true,
        }),
      });
      expect(unused.status, unused.json.error?.message).toBe(201);

      const buyer = await browser.newContext({ baseURL: BASE });
      const buyerPage = await buyer.newPage();
      await credentialsLogin(buyerPage, signed.email, signed.password);
      await completeBuyerOutletAddress(buyerPage, '400705');

      const welcome = await pollRewards(buyerPage, (d) =>
        (d.walletTransactions ?? []).some((t) => t.referenceType === 'welcome' && Number(t.amount) === 17)
        || (d.entries ?? []).some((e) => e.source === 'welcome' && Number(e.amount) === 17),
      );
      const welcomeTxns = (welcome.walletTransactions ?? []).filter((t) => t.referenceType === 'welcome');
      expect(welcomeTxns.length).toBe(1);

      // Listener must not double-issue if signup side-effects retry.
      const after = await api<{
        walletTransactions?: Array<{ referenceType?: string | null }>;
        entries?: Array<{ source?: string }>;
      }>(buyerPage, '/api/v1/promotions/rewards');
      expect((after.json.data?.walletTransactions ?? []).filter((t) => t.referenceType === 'welcome').length).toBe(1);

      const catalog = await pickCatalog(buyerPage);
      test.skip(!catalog, 'No catalog for first-order checkout');

      const vendorPage = await browser.newPage();
      await credentialsLogin(vendorPage, 'fresh@dailyfreshfoods.com', 'vendor123');
      await ensureDailyFreshVendorContext(vendorPage);
      await enterStore(vendorPage);

      const settings = await api<{ id: string }>(vendorPage, '/api/v1/vendor/settings');
      const vendorId = settings.json.data?.id;
      expect(vendorId).toBeTruthy();

      const inv = await api<Array<{ productId: string; outletId: string; qtyAvailable: number; qtyReserved: number; product?: { basePrice?: number; isActive: boolean } }>>(
        vendorPage,
        '/api/v1/vendor/inventory',
      );
      const rows = (inv.json.data ?? []) as Array<{
        productId: string;
        outletId: string;
        qtyAvailable: number;
        qtyReserved: number;
        product?: { basePrice?: number; isActive: boolean };
      }>;
      const row = rows.find((i) => i.product?.isActive && i.qtyAvailable - i.qtyReserved >= 1) ?? rows[0];
      test.skip(!row, 'Vendor has no inventory');
      await api(vendorPage, '/api/v1/vendor/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: row.productId,
          outletId: row.outletId,
          qtyAvailable: Math.max(Number(row.qtyAvailable) || 0, 0) + Number(row.qtyReserved || 0) + 500,
        }),
      });
      const mov = 500;
      const unit = Number(row.product?.basePrice ?? 35);
      const qty = Math.max(2, Math.ceil((mov + 50) / Math.max(unit, 1)));

      const placed = await api<{
        orders?: Array<{ id: string; status: string; couponDiscount?: unknown }>;
      }>(buyerPage, '/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'cod',
          vendorOrders: [{ vendorId, items: [{ productId: row.productId, quantity: qty }] }],
        }),
      });
      expect(placed.json.success, placed.json.error?.message).toBe(true);
      const orderId = placed.json.data?.orders?.[0]?.id;
      expect(orderId).toBeTruthy();
      expect(Number(placed.json.data?.orders?.[0]?.couponDiscount ?? 0)).toBe(0);

      const listed = await api<Array<{ id: string; usedCount?: number }>>(page, '/api/v1/admin/promotions/coupons?scope=platform');
      const unusedRow = (listed.json.data ?? []).find((c) => c.id === unused.json.data!.id);
      expect(Number(unusedRow?.usedCount ?? 0)).toBe(0);

      const pendingRewards = await pollRewards(buyerPage, (d) =>
        (d.entries ?? []).some((e) => e.source === 'order' && e.status === 'pending'),
      );
      const pendingOrderEntries = (pendingRewards.entries ?? []).filter((e) => e.source === 'order' && e.status === 'pending');
      expect(pendingOrderEntries.length).toBe(1);

      const confirmed = await api(vendorPage, `/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(confirmed.json.success, confirmed.json.error?.message).toBe(true);

      await pollRewards(buyerPage, (d) =>
        (d.walletTransactions ?? []).some((t) => t.referenceType === 'first_order' && Number(t.amount) === 23),
      );

      const delivered = await api(vendorPage, `/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered', proof: { proofType: 'notes', notes: 'e2e' } }),
      });
      expect(delivered.json.success, delivered.json.error?.message).toBe(true);

      const settled = await pollRewards(buyerPage, (d) =>
        (d.entries ?? []).some((e) => e.source === 'order' && e.status === 'credited'),
      );
      const credited = (settled.entries ?? []).filter((e) => e.source === 'order' && e.status === 'credited');
      expect(credited.length).toBe(1);
      const cashbackTxns = (settled.walletTransactions ?? []).filter((t) => t.referenceType === 'cashback' && t.type === 'credit');
      expect(cashbackTxns.length).toBeGreaterThanOrEqual(1);
      const cashbackCredits = cashbackTxns.length;

      const deliveredAgain = await api(vendorPage, `/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      });
      expect(deliveredAgain.json.success).toBe(true);
      const afterDup = await api<{
        entries?: Array<{ source?: string; status?: string }>;
        walletTransactions?: Array<{ referenceType?: string | null; type?: string }>;
      }>(buyerPage, '/api/v1/promotions/rewards');
      expect((afterDup.json.data?.entries ?? []).filter((e) => e.source === 'order' && e.status === 'credited').length).toBe(1);
      expect(
        (afterDup.json.data?.walletTransactions ?? []).filter((t) => t.referenceType === 'cashback' && t.type === 'credit').length,
      ).toBe(cashbackCredits);

      const placed2 = await api<{ orders?: Array<{ id: string }> }>(buyerPage, '/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'cod',
          vendorOrders: [{ vendorId, items: [{ productId: row.productId, quantity: qty }] }],
        }),
      });
      const order2 = placed2.json.data?.orders?.[0]?.id;
      if (placed2.json.success && order2) {
        await pollRewards(buyerPage, (d) =>
          (d.entries ?? []).some((e) => e.source === 'order' && e.status === 'pending'),
        );
        const cancelled = await api(vendorPage, `/api/v1/vendor/orders/${order2}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled', reason: 'e2e promo cancel' }),
        });
        expect(cancelled.json.success, cancelled.json.error?.message).toBe(true);
        await pollRewards(buyerPage, (d) =>
          (d.entries ?? []).some((e) => e.source === 'order' && e.status === 'cancelled'),
        );
      }

      await api(page, `/api/v1/admin/promotions/cashback/${campaign.json.data!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (unused.json.data?.id) {
        await api(page, `/api/v1/admin/promotions/coupons/${unused.json.data.id}`, { method: 'DELETE' });
      }
      await vendorPage.close();
      await buyer.close();
    } finally {
      try {
        await restore();
      } catch {
        /* best-effort restore after timeout / closed browser */
      }
    }
  });

  test('referral: no self-referral, no reassignment, duplicate token does not retarget', async ({ page, browser }) => {
    await credentialsLogin(page, 'admin@horeca1.com', 'admin123');
    const prev = await api<{
      isActive: boolean;
      trigger: string;
      minOrderValue?: unknown;
      referrerRewardType: string;
      referrerRewardValue: unknown;
      referredRewardType: string;
      referredRewardValue: unknown;
      referrerMaxDiscount?: unknown;
      referrerValidDays?: unknown;
      referredMaxDiscount?: unknown;
      referredValidDays?: unknown;
    } | null>(page, '/api/v1/admin/promotions/programs/referral');

    const restore = async () => {
      const r = prev.json.data;
      await api(page, '/api/v1/admin/promotions/programs/referral', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          r
            ? {
                isActive: r.isActive,
                trigger: r.trigger,
                minOrderValue: r.minOrderValue == null ? null : Number(r.minOrderValue),
                referrerRewardType: r.referrerRewardType,
                referrerRewardValue: Number(r.referrerRewardValue) || 1,
                referredRewardType: r.referredRewardType,
                referredRewardValue: Number(r.referredRewardValue) || 1,
                referrerMaxDiscount: r.referrerMaxDiscount == null ? null : Number(r.referrerMaxDiscount),
                referrerValidDays: r.referrerValidDays == null ? null : Number(r.referrerValidDays),
                referredMaxDiscount: r.referredMaxDiscount == null ? null : Number(r.referredMaxDiscount),
                referredValidDays: r.referredValidDays == null ? null : Number(r.referredValidDays),
              }
            : {
                isActive: false,
                trigger: 'signup',
                referrerRewardType: 'wallet_credit',
                referrerRewardValue: 1,
                referredRewardType: 'wallet_credit',
                referredRewardValue: 1,
              },
        ),
      });
    };

    try {
      const on = await api(page, '/api/v1/admin/promotions/programs/referral', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: true,
          trigger: 'signup',
          referrerRewardType: 'wallet_credit',
          referrerRewardValue: 31,
          referredRewardType: 'wallet_credit',
          referredRewardValue: 13,
        }),
      });
      expect(on.json.success, on.json.error?.message).toBe(true);

      const referrerCtx = await browser.newContext({ baseURL: BASE });
      const referrerPage = await referrerCtx.newPage();
      await credentialsLogin(referrerPage, 'chef@tajpalace.com', 'customer123');
      const mine = await api<{ token: string; referredBy: unknown }>(referrerPage, '/api/v1/promotions/referral');
      const token = mine.json.data!.token;

      // Self: visiting your own invite must not attribute you as referredBy yourself.
      await api(referrerPage, `/api/v1/promotions/invite/${token}`);
      const afterSelf = await api<{ referredBy: { name?: string } | null }>(referrerPage, '/api/v1/promotions/referral');
      const selfName = afterSelf.json.data?.referredBy?.name ?? '';
      expect(selfName.toLowerCase()).not.toMatch(/vikram singh|taj palace/);

      const friend = await signupCustomer(page, { cookieToken: token });
      expect(friend.status, friend.json.error?.message).toBe(201);

      const friendCtx = await browser.newContext({ baseURL: BASE });
      const friendPage = await friendCtx.newPage();
      await credentialsLogin(friendPage, friend.email, friend.password);
      const friendRef = await pollReferral(friendPage, (d) => Boolean(d.referredBy));
      expect(friendRef.referredBy).toBeTruthy();

      const otherMine = await api<{ token: string }>(referrerPage, '/api/v1/promotions/referral');
      await api(friendPage, `/api/v1/promotions/invite/${otherMine.json.data!.token}`);
      const still = await api<{ referredBy: { name?: string } | null }>(friendPage, '/api/v1/promotions/referral');
      expect(still.json.data?.referredBy?.name).toBe(friendRef.referredBy?.name);

      await referrerCtx.close();
      await friendCtx.close();
    } finally {
      try {
        await restore();
      } catch {
        /* best-effort restore after timeout / closed browser */
      }
    }
  });
});

async function pollReferral(
  page: Page,
  pred: (data: { referredBy: { name?: string } | null }) => boolean,
  timeoutMs = 20_000,
) {
  const start = Date.now();
  let last: { referredBy: { name?: string } | null } | null = null;
  while (Date.now() - start < timeoutMs) {
    const res = await api<{ referredBy: { name?: string } | null }>(page, '/api/v1/promotions/referral');
    last = res.json.data ?? null;
    if (res.json.success && res.json.data && pred(res.json.data)) return res.json.data;
    await page.waitForTimeout(500);
  }
  throw new Error(`Referral poll timed out. Last: ${JSON.stringify(last)}`);
}

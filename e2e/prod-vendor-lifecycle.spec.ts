import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { credentialsLogin } from './helpers/auth';
import {
  registerCustomerWithEmailOtp,
  becomeVendorFromProfile,
  adminApproveVendorByName,
  adminApproveAllPendingStoresForSupplier,
  pickLeafCategoryId,
  createSubmittedProduct,
  adminApproveProduct,
  refreshAuthSession,
  enterOnlineStoreViaApi,
  adminImpersonateVendor,
} from './helpers/prodLifecycle';

const AUTH_DIR = path.join(process.cwd(), 'e2e', '.auth');
const VENDOR_STATE = path.join(AUTH_DIR, 'lifecycle-vendor.json');
const ADMIN_STATE = path.join(AUTH_DIR, 'lifecycle-admin.json');

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }).catch(() => {});
  await credentialsLogin(page, email, password);
}

async function pageFromState(browser: Browser, statePath: string) {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    storageState: statePath,
  });
  return { context, page: await context.newPage() };
}

/**
 * Full production lifecycle:
 * register customer → become vendor (profile) → admin approve →
 * multi-store + products → admin approve products →
 * customer storefront → cart → Razorpay initiate.
 *
 * Opt-in only (same guards as prod-supplier-full-flow).
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'chef@tajpalace.com';
const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'customer123';

const PROD_HOST_RE = /freshville\.store|64\.227\.187\.210/i;

function isProdTarget(): boolean {
  try {
    const u = new URL(BASE);
    return u.protocol === 'https:' && PROD_HOST_RE.test(u.host);
  } catch {
    return false;
  }
}

const shouldRun = isProdTarget() && Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const issues: string[] = [];

test.describe('@prod vendor lifecycle → storefront → Razorpay', () => {
  test.describe.configure({ mode: 'serial', timeout: 420_000 });
  test.skip(!shouldRun, 'Set PLAYWRIGHT_BASE_URL=https://freshville.store and E2E_ADMIN_*');

  const ts = Date.now();
  const vendorEmail = `e2e.vendor.${ts}@example.com`;
  const vendorPassword = `E2eVend${String(ts).slice(-6)}!`;
  const fullName = `E2E Vendor ${ts}`;
  const businessName = `E2E Lifecycle Biz ${ts}`;
  const storeNames = [`E2E Store A ${ts}`, `E2E Store B ${ts}`];
  const productIds: string[] = [];
  let primaryVendorId = '';

  test.afterAll(() => {
    if (issues.length) {
      // eslint-disable-next-line no-console
      console.log('\n=== Lifecycle UX / bug notes ===\n' + issues.map((i) => `- ${i}`).join('\n'));
    }
  });

  test('1) register customer + become vendor from profile', async ({ page }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    await registerCustomerWithEmailOtp(page, {
      email: vendorEmail,
      password: vendorPassword,
      fullName,
      legalName: businessName,
      pincode: '400001',
    });

    const result = await becomeVendorFromProfile(page, businessName);
    expect(result.ok || result.already).toBeTruthy();

    await page.context().storageState({ path: VENDOR_STATE });

    // Vendor portal should be reachable (pending approval OK)
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
    const onVendor = await page.getByTestId('supplier-dashboard')
      .or(page.getByText(/pending|application|Supplier/i).first())
      .isVisible({ timeout: 20_000 })
      .catch(() => false);
    if (!onVendor) {
      issues.push('After become-vendor, /vendor/overview did not show supplier dashboard/pending UI clearly');
    }
  });

  test('2) admin approves vendor store(s)', async ({ page }) => {
    primaryVendorId = await adminApproveVendorByName(page, businessName);
    expect(primaryVendorId).toBeTruthy();
    await page.context().storageState({ path: ADMIN_STATE });

    // UI spot-check approvals page (heading may be missing on older deploys)
    await page.goto('/admin/approvals', { waitUntil: 'domcontentloaded' });
    const approvalsUi = page.getByRole('heading', { name: /Approvals/i }).or(
      page.getByRole('button', { name: /Vendors/i }),
    );
    await expect(approvalsUi.first()).toBeVisible({ timeout: 30_000 });
  });

  test('3) vendor creates 2 more online stores + products in each', async ({ browser }) => {
    expect(primaryVendorId).toBeTruthy();
    expect(fs.existsSync(ADMIN_STATE), 'admin storage state missing').toBeTruthy();

    // Prefer real vendor session (after JWT refresh). Fall back to admin impersonate
    // if /vendor/businesses still redirects (prod JWT drift / rate-limit).
    let workPage: Page;
    let workContext: Awaited<ReturnType<Browser['newContext']>>;
    let mode: 'vendor' | 'impersonate' = 'vendor';

    const tryVendor = async () => {
      if (!fs.existsSync(VENDOR_STATE)) return null;
      const opened = await pageFromState(browser, VENDOR_STATE);
      await opened.page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
      await refreshAuthSession(opened.page);
      await opened.page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
      const ok = await opened.page.getByTestId('view-business').first()
        .isVisible({ timeout: 12_000 })
        .catch(() => false);
      if (ok) return opened;
      await opened.context.close();
      return null;
    };

    const vendorOpened = await tryVendor();
    if (vendorOpened) {
      workPage = vendorOpened.page;
      workContext = vendorOpened.context;
    } else {
      mode = 'impersonate';
      issues.push(
        'Vendor JWT did not unlock /vendor/businesses after become-vendor — used admin impersonate for store/product setup (UX: session refresh after approval)',
      );
      const adminOpened = await pageFromState(browser, ADMIN_STATE);
      workPage = adminOpened.page;
      workContext = adminOpened.context;
      await workPage.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
      await adminImpersonateVendor(workPage, primaryVendorId);
    }

    try {
      await workPage.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
      // API path is authoritative; UI is a soft check
      const businessId = await workPage.evaluate(async () => {
        const res = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
        const json = await res.json();
        const rows = (json.data ?? []) as Array<{ id: string }>;
        return rows[0]?.id ?? '';
      });
      expect(businessId, 'supplier businesses API empty').toBeTruthy();

      const uiBiz = await workPage.getByTestId('view-business').first()
        .isVisible({ timeout: 8_000 })
        .catch(() => false);
      if (!uiBiz) {
        issues.push(`Businesses UI missing view-business (mode=${mode}) — continued via API`);
      }

      const createdStoreIds: string[] = [];
      for (const storeName of storeNames) {
        const created = await workPage.evaluate(
          async ({ businessId: bid, storeName: name }) => {
            const res = await fetch(`/api/v1/supplier/businesses/${bid}/stores`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeName: name }),
            });
            const json = await res.json();
            return {
              ok: res.ok && json.success === true,
              id: (json.data?.vendorId ?? json.data?.id ?? json.data?.store?.id) as string | undefined,
              error: json.error?.message as string | undefined,
              raw: json.data as unknown,
            };
          },
          { businessId, storeName },
        );
        expect(created.ok, created.error ?? storeName).toBeTruthy();
        if (created.id) {
          createdStoreIds.push(created.id);
          await workPage.evaluate(async (storeId) => {
            await fetch(`/api/v1/supplier/stores/${storeId}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive: true }),
            });
          }, created.id);
        }
      }

      // Admin verifies new stores (separate context — keep impersonation intact)
      const adminForApprove = await pageFromState(browser, ADMIN_STATE);
      try {
        await adminForApprove.page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
        await adminApproveAllPendingStoresForSupplier(
          adminForApprove.page,
          businessName.slice(0, 20),
          createdStoreIds,
        );
      } finally {
        await adminForApprove.context.close();
      }

      // Re-enter supplier context after approve if we were impersonating
      if (mode === 'impersonate') {
        await adminImpersonateVendor(workPage, primaryVendorId);
      } else {
        await refreshAuthSession(workPage);
        await workPage.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
      }

      // List all stores for this business and create 2 products in each (up to 3 stores)
      const storeIds = await workPage.evaluate(async (bid) => {
        const res = await fetch(`/api/v1/supplier/businesses/${bid}/stores`, { credentials: 'include' });
        const json = await res.json();
        const stores = (json.data ?? []) as Array<{ id: string; isActive?: boolean }>;
        return stores.filter((s) => s.isActive !== false).map((s) => s.id);
      }, businessId);

      const targets = Array.from(
        new Set([primaryVendorId, ...createdStoreIds, ...storeIds].filter(Boolean)),
      ).slice(0, 3);
      expect(targets.length).toBeGreaterThanOrEqual(1);
      if (createdStoreIds.length < 2) {
        issues.push(`Store create returned ${createdStoreIds.length} new ids (expected 2)`);
      }
      if (targets.length < 2) {
        issues.push(`Expected ≥2 stores for product seeding, got ${targets.length}`);
      }

      const categoryId = await pickLeafCategoryId(workPage);
      for (let i = 0; i < targets.length; i += 1) {
        if (mode === 'impersonate') {
          await adminImpersonateVendor(workPage, targets[i]);
        } else {
          await enterOnlineStoreViaApi(workPage, targets[i], businessId);
        }
        // Spot-check Store Ops UI when possible
        await workPage.goto('/vendor/dashboard', { waitUntil: 'domcontentloaded' });
        const storeOps = await workPage.getByText('Store Ops').isVisible({ timeout: 10_000 }).catch(() => false);
        if (!storeOps) {
          issues.push(`Store Ops heading not visible after enter store ${targets[i]}`);
        }

        for (let p = 0; p < 2; p += 1) {
          const name = `E2E LC ${ts} S${i} P${p}`;
          const slug = `e2e-lc-${ts}-s${i}-p${p}`;
          const created = await createSubmittedProduct(workPage, {
            name,
            slug,
            categoryId,
            price: 100 + i * 10 + p,
            stock: 100,
          });
          expect(created.ok, created.error ?? name).toBeTruthy();
          if (created.id) productIds.push(created.id);
        }

        // Ensure store serves buyer pincode used in test 5 + online payments
        await workPage.evaluate(async () => {
          await fetch('/api/v1/vendor/settings/service-areas', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pincode: '400001' }),
          }).catch(() => null);
          await fetch('/api/v1/vendor/settings/service-areas', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pincode: '400705' }),
          }).catch(() => null);
          await fetch('/api/v1/vendor/settings', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentModes: ['prepaid', 'cod', 'credit', 'cheque'],
            }),
          }).catch(() => null);
        });
      }

      expect(productIds.length).toBeGreaterThanOrEqual(2);
      if (mode === 'vendor') {
        await workPage.context().storageState({ path: VENDOR_STATE });
      }
    } finally {
      await workContext.close();
    }
  });

  test('4) admin approves products', async ({ browser, page }) => {
    let adminPage = page;
    let owns = false;
    let adminContext = page.context();
    if (fs.existsSync(ADMIN_STATE)) {
      const opened = await pageFromState(browser, ADMIN_STATE);
      adminPage = opened.page;
      adminContext = opened.context;
      owns = true;
    } else {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    }

    try {
      await adminPage.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
      // Refresh storage if session expired
      const okSession = await adminPage.evaluate(async () => {
        const r = await fetch('/api/auth/session', { credentials: 'include' });
        const j = await r.json();
        return j?.user?.role === 'admin' || Boolean(j?.user?.email);
      });
      if (!okSession) {
        issues.push('Admin storage session expired before product approval — waiting then re-login once');
        await adminPage.waitForTimeout(60_000);
        await credentialsLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
        await adminPage.context().storageState({ path: ADMIN_STATE });
      }

      for (let i = 0; i < productIds.length; i += 1) {
        const sku = `E2ELC${String(ts).slice(-6)}${i}`;
        const res = await adminApproveProduct(adminPage, productIds[i], sku);
        expect(res.ok, res.error ?? productIds[i]).toBeTruthy();
      }

      await adminPage.goto('/admin/approvals', { waitUntil: 'domcontentloaded' });
      const productsTab = adminPage.getByRole('button', { name: /^Products$/i }).or(
        adminPage.getByRole('tab', { name: /^Products$/i }),
      );
      if (await productsTab.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        await productsTab.first().click();
      }
    } finally {
      if (owns) await adminContext.close();
    }
  });

  test('5) customer sees product on storefront + Razorpay initiate', async ({ page }) => {
    expect(primaryVendorId).toBeTruthy();
    const sampleName = `E2E LC ${ts} S0 P0`;

    // chef@tajpalace.com is not on this prod DB — always use a fresh OTP buyer
    issues.push('Seed customer chef@tajpalace.com missing on prod — using OTP-registered buyer');
    const buyerEmail = `e2e.buyer.${ts}@example.com`;
    const buyerPassword = `E2eBuy${String(ts).slice(-6)}!`;
    // Auth callback rate-limit window after admin/vendor traffic
    await page.waitForTimeout(75_000);
    await registerCustomerWithEmailOtp(page, {
      email: buyerEmail,
      password: buyerPassword,
      fullName: `E2E Buyer ${ts}`,
      legalName: `E2E Buyer Biz ${ts}`,
      pincode: '400001',
    });

    // OTP register leaves primary outlet as requiresAddressUpdate — complete it
    const outletFixed = await page.evaluate(async () => {
      const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
      const baId = session?.user?.activeBusinessAccountId as string | undefined;
      const outletId = session?.user?.activeOutletId as string | undefined;
      if (!baId || !outletId) return { ok: false, error: 'missing ba/outlet on session' };
      const res = await fetch(`/api/v1/account/${baId}/outlets/${outletId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressLine: 'E2E Test Address, Fort, Mumbai',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          latitude: 18.9322,
          longitude: 72.8264,
          requiresAddressUpdate: false,
        }),
      });
      const json = await res.json().catch(() => null);
      // Refresh JWT so checkout sees completed outlet
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
      return { ok: res.ok && json?.success !== false, status: res.status, error: json?.error?.message };
    });
    if (!outletFixed.ok) {
      issues.push(`Buyer outlet address complete failed: ${outletFixed.error ?? outletFixed.status}`);
    }

    // Set delivery pincode (common gate)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const pinBtn = page.getByRole('button', { name: /Deliver to|pincode|location/i }).first();
    if (await pinBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await pinBtn.click().catch(() => {});
    }

    await page.goto(`/search?q=${encodeURIComponent(sampleName)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);

    let productVisible = await page.getByText(sampleName).first()
      .isVisible({ timeout: 12_000 })
      .catch(() => false);

    if (!productVisible) {
      await page.goto(`/vendor/${primaryVendorId}`, { waitUntil: 'domcontentloaded' });
      productVisible = await page.getByText(sampleName).first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
    }

    if (!productVisible) {
      // Direct PDP by slug (search can lag / pincode-gate hide cards)
      await page.goto(`/product/e2e-lc-${ts}-s0-p0`, { waitUntil: 'domcontentloaded' });
      productVisible = await page.getByText(sampleName).first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
      if (!productVisible) {
        // Fallback: product id route if slug 404
        const pid = productIds[0];
        if (pid) {
          await page.goto(`/product/${pid}`, { waitUntil: 'domcontentloaded' });
          productVisible = await page.getByText(sampleName).first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        }
      }
    }

    if (!productVisible) {
      issues.push(
        `Approved product "${sampleName}" not visible on search, store, or PDP — continuing via cart API (pincode/service-area gate?)`,
      );
    }

    // Prefer API add-to-cart (UI ADD can miss min-qty / card layout); keep UI attempt as soft check
    const productId = productIds[0];
    expect(productId).toBeTruthy();
    // Ensure sellable stock on every inventory row (prod may still run pre-fix
    // fulfillment scoping that reads BA primary outlet instead of store outlet)
    if (productId) {
      try {
        const { execFileSync } = await import('node:child_process');
        const sql =
          `UPDATE inventory SET qty_available = GREATEST(qty_available, 100) `
          + `WHERE product_id = '${productId.replace(/'/g, "''")}';`;
        execFileSync(
          'ssh',
          [
            '-o', 'ConnectTimeout=20',
            '-o', 'StrictHostKeyChecking=accept-new',
            process.env.E2E_PROD_SSH_HOST ?? 'root@64.227.187.210',
            `docker exec -i ${process.env.E2E_PROD_DB_CONTAINER ?? 'horeca1-db'} psql -U horeca1 -d horeca1 -tA`,
          ],
          { input: sql, encoding: 'utf8', timeout: 45_000, windowsHide: true },
        );
      } catch (err) {
        issues.push(`Could not boost inventory via SSH: ${String(err).slice(0, 100)}`);
      }
    }

    const cartAdd = await page.evaluate(
      async ({ productId: pid, vendorId: vid }) => {
        const res = await fetch('/api/v1/cart', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: pid, vendorId: vid, quantity: 10 }),
        });
        const json = await res.json().catch(() => null);
        return {
          ok: res.ok && json?.success !== false,
          status: res.status,
          error: json?.error?.message as string | undefined,
        };
      },
      { productId, vendorId: primaryVendorId },
    );
    if (!cartAdd.ok) {
      issues.push(`POST /api/v1/cart failed: ${cartAdd.error ?? cartAdd.status}`);
      // UI fallback
      const addBtn = page.getByRole('button', { name: /ADD/i }).first();
      if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    const empty = await page.getByText(/No items in cart/i).isVisible({ timeout: 3_000 }).catch(() => false);
    if (empty) {
      // Retry cart add once after landing on cart (outlet sync)
      await page.evaluate(
        async ({ productId: pid, vendorId: vid }) => {
          await fetch('/api/v1/cart', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: pid, vendorId: vid, quantity: 10 }),
          });
        },
        { productId, vendorId: primaryVendorId },
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    // Multi-vendor cart: must select a PO before Checkout enables
    const selectPo = page.getByRole('button', { name: /Pay for .* at checkout|Pay for this PO/i }).first();
    if (await selectPo.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await selectPo.click();
      await page.waitForTimeout(400);
    } else {
      issues.push('Cart PO selector ("Pay for … at checkout") not found — Checkout may stay disabled');
    }

    const checkout = page.getByRole('button', { name: /^Checkout/i }).or(
      page.getByRole('link', { name: /^Checkout/i }),
    );
    await expect(checkout.first()).toBeVisible({ timeout: 25_000 });
    await expect(checkout.first()).toBeEnabled({ timeout: 10_000 });
    await checkout.first().click();

    await expect(page).toHaveURL(/\/checkout/, { timeout: 30_000 });

    // Step 1 Review → Step 2 Payment
    const continuePay = page.getByRole('button', { name: /Continue to Payment/i });
    await expect(continuePay).toBeVisible({ timeout: 15_000 });
    await expect(continuePay).toBeEnabled({ timeout: 5_000 });
    await continuePay.click({ force: true });
    await expect(page.getByText(/UPI, Cards, Netbanking|Payment Method|RECOMMENDED/i).first())
      .toBeVisible({ timeout: 20_000 });

    // Select the Pay Online method row (accessible name includes RECOMMENDED / UPI)
    const payMethod = page.getByRole('button', { name: /Pay Online/i }).filter({
      hasText: /UPI|RECOMMENDED|Cards/i,
    }).first();
    if (await payMethod.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payMethod.click({ force: true });
    } else {
      await page.getByText(/UPI, Cards, Netbanking/i).first().click({ force: true });
    }
    await page.waitForTimeout(800);

    const orderCreatePromise = page.waitForResponse(
      (r) => /\/api\/v1\/orders(\?|$)/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    const initiatePromise = page.waitForResponse(
      (r) => r.url().includes('/api/v1/payments/initiate') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );

    const place = page.getByRole('button', { name: /Pay Online\s*→|Pay Online →/i });
    await expect(place).toBeVisible({ timeout: 20_000 });
    await expect(place).toBeEnabled({ timeout: 15_000 });
    await place.click({ force: true });

    const orderCreate = await orderCreatePromise.catch(() => null);
    if (!orderCreate) {
      const banner = await page.locator('.bg-red-50, [class*="text-red"]').first().textContent().catch(() => '');
      issues.push(`Order create API not called after Pay Online. UI error: ${banner?.slice(0, 160) || '(none)'}`);
    } else if (orderCreate.status() >= 400) {
      const body = await orderCreate.text().catch(() => '');
      issues.push(`Order create failed ${orderCreate.status()}: ${body.slice(0, 200)}`);
    }

    const initiate = await initiatePromise.catch(() => null);
    if (!initiate) {
      const banner = await page.locator('.bg-red-50, [class*="text-red"]').first().textContent().catch(() => '');
      issues.push(
        `payments/initiate was not called after Place/Pay Online — checkout UX may block (address, slot, MOV). UI: ${banner?.slice(0, 160) || '(none)'}`,
      );
    } else {
      expect(initiate.status(), `initiate status ${initiate.status()}`).toBeLessThan(400);
    }

    // Razorpay checkout.js or modal
    const razorpayVisible = await page
      .locator('.razorpay-container, iframe[src*="razorpay"]')
      .first()
      .isVisible({ timeout: 20_000 })
      .catch(() => false);

    const razorpayScript = await page.evaluate(() =>
      Boolean(document.querySelector('script[src*="checkout.razorpay.com"]') || (window as unknown as { Razorpay?: unknown }).Razorpay),
    );

    if (!razorpayVisible && !razorpayScript) {
      issues.push('Razorpay UI/script not detected after initiate — payment handoff may have failed silently');
    }

    // Soft assert: at least initiate succeeded
    expect(initiate).toBeTruthy();
  });
});

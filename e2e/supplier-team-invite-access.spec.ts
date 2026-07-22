import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { passwordLogin, credentialsLogin } from './helpers/auth';

/**
 * Team invite + access (both sides):
 * 1) Inviter (admin impersonation) grants multi-BA + limited permissions
 * 2) Invitee logs in and sees only allowed nav / businesses
 * 3) UI wizard smoke: multi-select businesses, no Repeat Orders in matrix
 */

test.describe.configure({ timeout: 180_000 });

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@horeca1.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

const LIMITED_PERMISSIONS = {
  dashboard: { view: true },
  orders: { view: true },
  inventory: { view: true },
} as const;

type BusinessRow = {
  id: string;
  legalName?: string;
  displayName?: string | null;
  stores?: Array<{ id: string; name?: string; isActive?: boolean }>;
};

async function adminImpersonateVendor(page: Page): Promise<string> {
  const vendorId = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=20', { credentials: 'include' });
    const json = await list.json();
    const vendors = (json.data?.vendors ?? []) as Array<{ id: string; isActive?: boolean }>;
    const active = vendors.find((v) => v.isActive !== false);
    return active?.id ?? vendors[0]?.id ?? null;
  });
  expect(vendorId, 'Need at least one vendor to impersonate').toBeTruthy();

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
  return vendorId as string;
}

async function listSupplierBusinesses(page: Page): Promise<BusinessRow[]> {
  return page.evaluate(async () => {
    const res = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const json = await res.json();
    return (json.success ? (json.data ?? []) : []) as BusinessRow[];
  });
}

async function ensureTwoBusinesses(page: Page): Promise<string[]> {
  let businesses = await listSupplierBusinesses(page);
  if (businesses.length >= 2) {
    return businesses.slice(0, 2).map((b) => b.id);
  }

  const stamp = Date.now();
  const created = await page.evaluate(async (name) => {
    const res = await fetch('/api/v1/supplier/businesses', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: name,
        displayName: name,
        vendorTypeSelections: [
          { type: 'Distributor', slug: 'distributor', subTypes: ['HoReCa Distributor'] },
        ],
        businessSize: 'Small',
      }),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.success === true,
      businessAccountId: json.data?.businessAccountId as string | undefined,
      error: json.error?.message as string | undefined,
    };
  }, `E2E Team BA ${stamp}`);
  expect(created.ok, created.error ?? 'create business failed').toBeTruthy();
  expect(created.businessAccountId).toBeTruthy();

  const store = await page.evaluate(
    async ({ bid, name }) => {
      const res = await fetch(`/api/v1/supplier/businesses/${bid}/stores`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: name,
          storeDisplayName: name,
          authorizedPersonName: 'E2E Contact',
          authorizedPersonPhone: '9876543210',
          authorizedPersonEmail: `team.store.${Date.now()}@example.com`,
          addressLine: 'E2E Store Address',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          pickupAddressLine: 'E2E Store Address',
          pickupCity: 'Mumbai',
          pickupState: 'Maharashtra',
          pickupPincode: '400001',
          deliveryCapability: 'own_fleet',
          serviceablePincodes: ['400001'],
          bankAccountName: 'E2E Contact',
          bankAccountNumber: '123456789012',
          bankIfsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
          bankAccountType: 'current',
        }),
      });
      const json = await res.json();
      return {
        ok: res.ok && json.success === true,
        error: json.error?.message as string | undefined,
      };
    },
    { bid: created.businessAccountId!, name: `E2E Team Store ${stamp}` },
  );
  expect(store.ok, store.error ?? 'create store failed').toBeTruthy();

  businesses = await listSupplierBusinesses(page);
  expect(businesses.length, 'Need ≥2 supplier businesses after create').toBeGreaterThanOrEqual(2);
  return businesses.slice(0, 2).map((b) => b.id);
}

async function inviteLimitedMember(
  page: Page,
  opts: {
    email: string;
    password: string;
    fullName: string;
    businessAccountIds: string[];
  },
) {
  // Land on a stable vendor page so evaluate isn't racing a navigation.
  await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Team/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  let last: {
    ok: boolean;
    status: number;
    error: string;
    memberId?: string;
  } = { ok: false, status: 0, error: 'not attempted' };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      last = await page.evaluate(
        async ({ email, password, fullName, businessAccountIds, permissions }) => {
          const res = await fetch('/api/v1/vendor/team', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: email,
              fullName,
              password,
              permissions,
              businessAccountIds,
              scope: 'business',
            }),
          });
          const json = await res.json().catch(() => ({}));
          return {
            ok: json.success === true,
            status: res.status,
            error: (json.error?.message as string | undefined) ?? JSON.stringify(json.error ?? null),
            memberId: json.data?.id as string | undefined,
          };
        },
        { ...opts, permissions: LIMITED_PERMISSIONS },
      );
      if (last.ok || last.status >= 400) return last;
    } catch (err) {
      last = {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      await page.waitForTimeout(1500 * (attempt + 1));
      await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  return last;
}

test.describe('supplier team invite + access', () => {
  test('API invite multi-BA → invitee sees both businesses and limited nav', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    const inviteEmail = `e2e-tm-${stamp}@example.com`;
    const invitePassword = 'TeamTest123!';
    const inviteName = `E2E Team Member ${stamp}`;

    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminImpersonateVendor(page);

    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });
    const baIds = await ensureTwoBusinesses(page);

    const invite = await inviteLimitedMember(page, {
      email: inviteEmail,
      password: invitePassword,
      fullName: inviteName,
      businessAccountIds: baIds,
    });
    expect(invite.ok, invite.error ?? `invite status ${invite.status}`).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(inviteEmail).first()).toBeVisible({ timeout: 25_000 });

    // ── Invitee side ─────────────────────────────────────────────────────────
    const memberCtx: BrowserContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    const memberPage = await memberCtx.newPage();
    try {
      await credentialsLogin(memberPage, inviteEmail, invitePassword);

      const memberBas = await memberPage.evaluate(async () => {
        const res = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
        const json = await res.json();
        if (!json.success) return [] as string[];
        return ((json.data ?? []) as BusinessRow[]).map((b) => b.id);
      });
      for (const id of baIds) {
        expect(memberBas, `invitee should belong to business ${id}`).toContain(id);
      }

      await memberPage.goto('/vendor/dashboard', { waitUntil: 'domcontentloaded' });
      // Limited grant: dashboard/orders/inventory view — products write must not appear
      await expect(memberPage.getByRole('link', { name: /^Dashboard$/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(memberPage.getByRole('link', { name: /^Orders$/i }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Products nav requires products.view — not granted
      await expect(memberPage.getByRole('link', { name: /^Products$/i })).toHaveCount(0);
      await expect(memberPage.getByRole('link', { name: /^Promotions$/i })).toHaveCount(0);

      // Direct products URL should not expose create UI
      await memberPage.goto('/vendor/products', { waitUntil: 'domcontentloaded' });
      await expect(memberPage.getByRole('button', { name: /Add Product|New Product/i })).toHaveCount(0);

      // POST create should be forbidden for limited member
      const createStatus = await memberPage.evaluate(async () => {
        const res = await fetch('/api/v1/vendor/products', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Should Fail', unit: 'kg', price: 1 }),
        });
        return res.status;
      });
      expect(createStatus).toBeGreaterThanOrEqual(400);
    } finally {
      await memberCtx.close();
      await page.evaluate(() =>
        fetch('/api/v1/admin/impersonate', { method: 'DELETE', credentials: 'include' }),
      ).catch(() => {});
    }
  });

  test('Add Member wizard: multi-select businesses + no Repeat Orders', async ({ page }) => {
    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminImpersonateVendor(page);
    await ensureTwoBusinesses(page);

    await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Team/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /Add Member/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Team Member' })).toBeVisible({
      timeout: 15_000,
    });

    const stamp = Date.now();
    await page.getByPlaceholder('e.g. teammate@company.com or 9876543210').fill(
      `e2e-wizard-${stamp}@example.com`,
    );
    await page.getByPlaceholder('e.g. Rahul Sharma').fill(`Wizard User ${stamp}`);
    const pw = page.locator('[data-field="password"] input');
    await expect(pw).toBeVisible();
    await pw.fill('wizard123');
    // Password field should use the same light border treatment (not browser default thick black)
    await expect(pw).toHaveClass(/border-\[#EEEEEE\]/);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible({ timeout: 20_000 });

    const businessSection = page.getByText('Business Account', { exact: false }).first();
    await expect(businessSection).toBeVisible();

    // Wait for businesses to load — cards are buttons with store counts
    const bizCards = page.locator('button').filter({ hasText: /\d+\s+stores?/i });
    await expect(bizCards.first()).toBeVisible({ timeout: 20_000 });
    const cardCount = await bizCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    // Toggle second business on (first is usually pre-selected)
    if (cardCount >= 2) {
      await bizCards.nth(1).click();
    }
    await expect(page.getByText(/All stores/i).first()).toBeVisible();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole('row', { name: /Repeat Orders/i })).toHaveCount(0);

    const groupHeaders = page.locator('tbody tr td[colspan]').filter({
      hasText: /Operations|Warehouse|Catalog/,
    });
    await expect(groupHeaders.nth(0)).toHaveText('Operations');
    await expect(groupHeaders.nth(1)).toHaveText('Warehouse');
    await expect(groupHeaders.nth(2)).toHaveText('Catalog');

    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() =>
      fetch('/api/v1/admin/impersonate', { method: 'DELETE', credentials: 'include' }),
    ).catch(() => {});
  });
});

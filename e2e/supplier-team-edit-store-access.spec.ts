import { test, expect, type Page } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

/**
 * Edit Team Member — multi-business store select/unselect.
 * Covers All stores, one store, one store per BA, and invalid multi-unselect (empty BA).
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

type MemberAccess = {
  businessAccountIds: string[];
  storeIds: string[];
  scope: 'business' | 'store';
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

async function createStoreUnderBa(page: Page, bid: string, name: string): Promise<string> {
  const created = await page.evaluate(
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
          authorizedPersonEmail: `edit.store.${Date.now()}@example.com`,
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
        storeId: (json.data?.id ?? json.data?.vendorId ?? json.data?.storeId) as string | undefined,
        error: json.error?.message as string | undefined,
      };
    },
    { bid, name },
  );
  expect(created.ok, created.error ?? 'create store failed').toBeTruthy();

  // Prefer id from create response; fall back to listing
  if (created.storeId) return created.storeId;
  const businesses = await listSupplierBusinesses(page);
  const ba = businesses.find((b) => b.id === bid);
  const store = (ba?.stores ?? []).find((s) => s.isActive !== false) ?? ba?.stores?.[0];
  expect(store?.id, `store under BA ${bid}`).toBeTruthy();
  return store!.id;
}

async function ensureTwoBusinessesWithStores(
  page: Page,
): Promise<Array<{ baId: string; storeId: string }>> {
  let businesses = await listSupplierBusinesses(page);
  const withStores = () =>
    businesses
      .filter((b) => (b.stores?.length ?? 0) >= 1)
      .map((b) => ({ baId: b.id, storeId: b.stores![0].id }));

  let ready = withStores();
  if (ready.length >= 2) return ready.slice(0, 2);

  // Prefer existing BAs; only create a store when a BA has none (avoid cascade timeouts).
  const stamp = Date.now();
  for (const ba of businesses) {
    if ((ba.stores?.length ?? 0) > 0) continue;
    await createStoreUnderBa(page, ba.id, `E2E Edit Store ${stamp}-${ba.id.slice(0, 6)}`);
    businesses = await listSupplierBusinesses(page);
    ready = withStores();
    if (ready.length >= 2) return ready.slice(0, 2);
  }

  while (ready.length < 2) {
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
    }, `E2E Edit BA ${stamp}-${ready.length}`);
    expect(created.ok, created.error ?? 'create business failed').toBeTruthy();
    expect(created.businessAccountId).toBeTruthy();
    await createStoreUnderBa(
      page,
      created.businessAccountId!,
      `E2E Edit Store ${stamp}-${ready.length}`,
    );
    businesses = await listSupplierBusinesses(page);
    ready = withStores();
  }

  return ready.slice(0, 2);
}

async function inviteMember(
  page: Page,
  opts: {
    email: string;
    password: string;
    fullName: string;
    businessAccountIds: string[];
    scope?: 'business' | 'store';
    storeIds?: string[];
  },
): Promise<{ ok: boolean; status: number; error: string; memberId?: string }> {
  await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Team/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  let last: { ok: boolean; status: number; error: string; memberId?: string } = {
    ok: false,
    status: 0,
    error: 'not attempted',
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      last = await page.evaluate(
        async ({ email, password, fullName, businessAccountIds, scope, storeIds, permissions }) => {
          const body: Record<string, unknown> = {
            identifier: email,
            fullName,
            password,
            permissions,
            businessAccountIds,
            scope: scope ?? 'business',
          };
          if (storeIds?.length) body.storeIds = storeIds;
          const res = await fetch('/api/v1/vendor/team', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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
      if (last.ok || (last.status >= 400 && last.status < 500 && !/took too long/i.test(last.error))) {
        return last;
      }
    } catch (err) {
      last = {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    await page.waitForTimeout(1500 * (attempt + 1));
  }
  return last;
}

async function patchMemberAccess(
  page: Page,
  memberId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; error: string }> {
  return page.evaluate(
    async ({ memberId, body }) => {
      const res = await fetch(`/api/v1/vendor/team/${memberId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      return {
        ok: json.success === true,
        status: res.status,
        error: (json.error?.message as string | undefined) ?? JSON.stringify(json.error ?? null),
      };
    },
    { memberId, body },
  );
}

async function getMemberAccess(page: Page, memberId: string): Promise<MemberAccess> {
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/vendor/team/${id}`, { credentials: 'include' });
    const json = await res.json();
    return {
      ok: json.success === true,
      error: (json.error?.message as string | undefined) ?? null,
      data: json.data as MemberAccess | undefined,
    };
  }, memberId);
  expect(result.ok, result.error ?? 'GET member failed').toBeTruthy();
  expect(result.data).toBeTruthy();
  return result.data!;
}

/** Membership id for the *current* vendor context (invite may return another store's row). */
async function resolveMemberIdByEmail(page: Page, email: string): Promise<string> {
  const found = await page.evaluate(async (targetEmail) => {
    const res = await fetch('/api/v1/vendor/team', { credentials: 'include' });
    const json = await res.json();
    const rows = (json.success ? (json.data ?? []) : []) as Array<{
      id: string;
      user?: { email?: string | null };
    }>;
    const hit = rows.find(
      (r) => (r.user?.email ?? '').toLowerCase() === targetEmail.toLowerCase(),
    );
    return hit?.id ?? null;
  }, email);
  expect(found, `team list should include ${email}`).toBeTruthy();
  return found!;
}

test.describe('supplier team edit store access', () => {
  test.afterEach(async ({ page }) => {
    await Promise.race([
      page.evaluate(() =>
        fetch('/api/v1/admin/impersonate', { method: 'DELETE', credentials: 'include' }),
      ),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]).catch(() => {});
  });

  test('API: All stores / one store / both stores / reject empty-BA unselect', async ({ page }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const inviteEmail = `e2e-edit-store-${stamp}@example.com`;
    const invitePassword = 'TeamTest123!';
    const inviteName = `E2E Edit Store ${stamp}`;

    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const activeVendorId = await adminImpersonateVendor(page);
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });

    const pairs = await ensureTwoBusinessesWithStores(page);

    // Anchor storeA to the impersonated vendor so GET/PATCH membership id stays valid.
    const businesses = await listSupplierBusinesses(page);
    const activeBa = businesses.find((b) => (b.stores ?? []).some((s) => s.id === activeVendorId));
    const otherPair = pairs.find((p) => p.baId !== activeBa?.id);
    expect(activeBa?.id, 'active vendor must belong to a listed business').toBeTruthy();
    expect(otherPair, 'need a second business with a store').toBeTruthy();

    const baA = activeBa!.id;
    const storeA = activeVendorId;
    const baB = otherPair!.baId;
    const storeB = otherPair!.storeId;
    const baIds = [baA, baB];

    const invite = await inviteMember(page, {
      email: inviteEmail,
      password: invitePassword,
      fullName: inviteName,
      businessAccountIds: baIds,
      scope: 'business',
    });
    expect(invite.ok, invite.error ?? `invite status ${invite.status}`).toBeTruthy();
    const memberId = await resolveMemberIdByEmail(page, inviteEmail);

    // 1) Both businesses / All stores
    const allSave = await patchMemberAccess(page, memberId, {
      businessAccountIds: baIds,
      scope: 'business',
      permissions: LIMITED_PERMISSIONS,
    });
    expect(allSave.ok, allSave.error).toBeTruthy();
    const allGet = await getMemberAccess(page, memberId);
    expect(allGet.scope).toBe('business');
    expect(allGet.storeIds).toEqual([]);
    for (const id of baIds) {
      expect(allGet.businessAccountIds).toContain(id);
    }

    // 2) One store only — keep the active store so membership row for this vendor remains
    const oneSave = await patchMemberAccess(page, memberId, {
      businessAccountIds: [baA],
      scope: 'store',
      storeIds: [storeA],
      permissions: LIMITED_PERMISSIONS,
    });
    expect(oneSave.ok, oneSave.error).toBeTruthy();
    const oneGet = await getMemberAccess(page, memberId);
    expect(oneGet.scope).toBe('store');
    expect(oneGet.businessAccountIds).toEqual([baA]);
    expect(oneGet.storeIds.sort()).toEqual([storeA].sort());

    // 3) One store per business (both BAs, not All)
    const bothSave = await patchMemberAccess(page, memberId, {
      businessAccountIds: baIds,
      scope: 'store',
      storeIds: [storeA, storeB],
      permissions: LIMITED_PERMISSIONS,
    });
    expect(bothSave.ok, bothSave.error).toBeTruthy();
    // Re-resolve id in case team list preferred another store row after multi-BA sync
    const memberIdBoth = await resolveMemberIdByEmail(page, inviteEmail);
    const bothGet = await getMemberAccess(page, memberIdBoth);
    expect(bothGet.scope).toBe('store');
    expect([...bothGet.businessAccountIds].sort()).toEqual([...baIds].sort());
    expect([...bothGet.storeIds].sort()).toEqual([storeA, storeB].sort());

    // 4) Multi-unselect invalid: both BAs selected but only storeA → 400
    const bad = await patchMemberAccess(page, memberIdBoth, {
      businessAccountIds: baIds,
      scope: 'store',
      storeIds: [storeA],
      permissions: LIMITED_PERMISSIONS,
    });
    expect(bad.ok).toBeFalsy();
    expect(bad.status).toBe(400);
    expect(bad.error).toMatch(/at least one store for each selected business/i);

    // After rejection, access must still be both stores
    const stillBoth = await getMemberAccess(page, memberIdBoth);
    expect(stillBoth.scope).toBe('store');
    expect([...stillBoth.storeIds].sort()).toEqual([storeA, storeB].sort());

    // Recover: leave one store only (drop empty BA) — keep active store
    const recover = await patchMemberAccess(page, memberIdBoth, {
      businessAccountIds: [baA],
      scope: 'store',
      storeIds: [storeA],
      permissions: LIMITED_PERMISSIONS,
    });
    expect(recover.ok, recover.error).toBeTruthy();
    const memberIdRecover = await resolveMemberIdByEmail(page, inviteEmail);
    const recoverGet = await getMemberAccess(page, memberIdRecover);
    expect(recoverGet.scope).toBe('store');
    expect(recoverGet.businessAccountIds).toEqual([baA]);
    expect(recoverGet.storeIds).toEqual([storeA]);
  });

  test('Edit modal: All stores shows stores checked; unselect leaves All off', async ({ page }) => {
    const stamp = Date.now();
    const inviteEmail = `e2e-edit-ui-${stamp}@example.com`;

    await passwordLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminImpersonateVendor(page);
    await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });

    const pairs = await ensureTwoBusinessesWithStores(page);
    const baIds = pairs.map((p) => p.baId);

    const inviteName = `E2E Edit UI ${stamp}`;
    const invite = await inviteMember(page, {
      email: inviteEmail,
      password: 'TeamTest123!',
      fullName: inviteName,
      businessAccountIds: baIds,
      scope: 'business',
    });
    expect(invite.ok, invite.error).toBeTruthy();

    await page.goto('/vendor/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(inviteEmail).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole('button', { name: new RegExp(`Change role for ${inviteName}`, 'i') }).click();

    const modal = page.locator('div.fixed').filter({
      has: page.getByRole('heading', { name: /Edit Team Member/i }),
    });
    await expect(modal).toBeVisible({ timeout: 20_000 });

    // Wait for hydrate — avoid matching the subtitle "store access & role"
    const allStores = modal.getByRole('button', {
      name: /All stores \(across selected businesses\)/i,
    });
    await expect(allStores).toBeVisible({ timeout: 30_000 });

    const storeList = allStores.locator(
      'xpath=ancestor::div[contains(@class,"divide-y")][1]',
    );
    const storePickButtons = storeList.locator('button').filter({ hasNotText: /All stores/i });
    await expect(storePickButtons.first()).toBeVisible({ timeout: 10_000 });
    const storeCount = await storePickButtons.count();
    expect(storeCount).toBeGreaterThanOrEqual(2);

    // Leave All by unchecking the first store — remaining stores stay selected
    await storePickButtons.first().click();
    await expect(modal.getByText(/\d+\s+selected/i).first()).toBeVisible({ timeout: 5_000 });

    // Multi-unselect: clear every remaining store, then Save must require a store
    for (let i = 1; i < storeCount; i += 1) {
      await storePickButtons.nth(i).click();
    }
    await modal.getByRole('button', { name: /Save Changes/i }).click();
    await expect(
      modal.getByText(/Select at least one store/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape').catch(() => {});
  });
});

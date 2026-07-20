import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 120_000 });

test('supplier multi-store: create second Online Store and switch', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');

  const created = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const listJson = await listRes.json();
    const rows = (listJson.data ?? []) as Array<{
      id: string;
      legalName?: string;
      displayName?: string | null;
      stores: Array<{ id: string }>;
    }>;
    const ba =
      rows.find((b) => /daily fresh/i.test(b.legalName ?? '') || /daily fresh/i.test(b.displayName ?? ''))
      ?? rows[0];
    if (!ba?.id) return { ok: false as const, reason: 'no-business' };

    const name = `E2E Store ${Date.now().toString(36)}`;
    const createRes = await fetch(`/api/v1/supplier/businesses/${ba.id}/stores`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: name }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.success) {
      return { ok: false as const, reason: createJson.error?.message ?? 'create-failed' };
    }
    const newStoreId = (createJson.data?.vendorId ?? createJson.data?.id) as string;
    if (!newStoreId) return { ok: false as const, reason: 'missing-vendorId' };

    // Enable first (new stores start inactive), then switch
    const enableRes = await fetch(`/api/v1/supplier/stores/${newStoreId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    const switchRes = await fetch('/api/v1/auth/switch-online-store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: newStoreId }),
    });
    const switchJson = await switchRes.json();

    const disableRes = await fetch(`/api/v1/supplier/stores/${newStoreId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    const reenableRes = await fetch(`/api/v1/supplier/stores/${newStoreId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });

    const originalStoreId = ba.stores?.[0]?.id as string | undefined;
    if (originalStoreId) {
      await fetch('/api/v1/auth/switch-online-store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: originalStoreId }),
      });
    }

    return {
      ok: true as const,
      newStoreId,
      switchOk: switchRes.ok && switchJson.success === true,
      switchError: switchJson.error?.message as string | undefined,
      activeVendorId: switchJson.data?.vendorId as string | undefined,
      disableOk: disableRes.ok,
      enableOk: enableRes.ok && reenableRes.ok,
      businessId: ba.id,
      restored: Boolean(originalStoreId),
    };
  });

  expect(created.ok, created.ok ? '' : created.reason).toBeTruthy();
  if (!created.ok) return;
  expect(created.switchOk).toBeTruthy();
  expect(created.activeVendorId).toBe(created.newStoreId);
  expect(created.disableOk).toBeTruthy();
  expect(created.enableOk).toBeTruthy();
});

test('supplier multi-business: create second Business', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');

  const result = await page.evaluate(async () => {
    const before = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const beforeJson = await before.json();
    const beforeCount = (beforeJson.data ?? []).length;

    const name = `E2E Biz ${Date.now().toString(36)}`;
    const createRes = await fetch('/api/v1/supplier/businesses', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: `${name} Pvt Ltd`,
        storeName: `${name} Store`,
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.success) {
      return { ok: false as const, reason: createJson.error?.message ?? 'create-failed' };
    }

    const after = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const afterJson = await after.json();
    const afterCount = (afterJson.data ?? []).length;
    const newBa = (afterJson.data ?? []).find(
      (b: { legalName?: string }) => b.legalName === `${name} Pvt Ltd`,
    );

    return {
      ok: true as const,
      beforeCount,
      afterCount,
      newBaId: newBa?.id as string | undefined,
      storeCount: newBa?.stores?.length as number | undefined,
    };
  });

  expect(result.ok, result.ok ? '' : result.reason).toBeTruthy();
  if (!result.ok) return;
  expect(result.afterCount).toBeGreaterThan(result.beforeCount);
  expect(result.newBaId).toBeTruthy();
  expect(result.storeCount).toBeGreaterThanOrEqual(1);
});

test('admin suppliers registry + impersonation hierarchy + store switch', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  await page.goto('/admin/vendors', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Suppliers$/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Vendors Registry/i)).toHaveCount(0);

  const flow = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/admin/vendors?view=suppliers&limit=100', {
      credentials: 'include',
    });
    const listJson = await listRes.json();
    const suppliers = (listJson.data?.suppliers ?? []) as Array<{
      userId: string;
      businesses: Array<{ stores: Array<{ id: string }> }>;
    }>;

    // Prefer a supplier with 2+ stores; else create a second store under first supplier via impersonation later
    let storeA: string | undefined;
    let storeB: string | undefined;
    let supplierUserId: string | undefined;

    for (const s of suppliers) {
      const stores = s.businesses.flatMap((b) => b.stores);
      if (stores.length >= 2) {
        storeA = stores[0].id;
        storeB = stores[1].id;
        supplierUserId = s.userId;
        break;
      }
      if (!storeA && stores[0]) {
        storeA = stores[0].id;
        supplierUserId = s.userId;
      }
    }
    if (!storeA) return { ok: false as const, reason: 'no-stores' };

    // Impersonate Supplier (preferred) — cookie still binds a store under the hood
    const impRes = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        supplierUserId ? { supplierUserId } : { vendorId: storeA },
      ),
    });
    if (!impRes.ok) return { ok: false as const, reason: 'impersonate-failed' };

    // Businesses hub must show supplier's businesses (not admin empty)
    const bizRes = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const bizJson = await bizRes.json();
    const bizList = (bizJson.data ?? []) as Array<{
      id: string;
      stores: Array<{ id: string }>;
    }>;
    if (!bizRes.ok || bizList.length === 0) {
      return { ok: false as const, reason: 'businesses-empty-under-admin-view' };
    }

    // Ensure a second store exists for switch test
    if (!storeB) {
      const baId = bizList[0].id;
      const createRes = await fetch(`/api/v1/supplier/businesses/${baId}/stores`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName: `AdminView Store ${Date.now().toString(36)}` }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.success) {
        return { ok: false as const, reason: createJson.error?.message ?? 'create-store-failed' };
      }
      storeB = (createJson.data.vendorId ?? createJson.data.id) as string;
    }

    // Switch Online Store via PATCH impersonate
    const switchRes = await fetch('/api/v1/admin/impersonate', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: storeB }),
    });
    const switchJson = await switchRes.json();

    const getRes = await fetch('/api/v1/admin/impersonate', { credentials: 'include' });
    const getJson = await getRes.json();

    // Pincode conflict still keyed to supplier (not admin)
    const settingsRes = await fetch('/api/v1/vendor/settings', { credentials: 'include' });
    const settingsJson = await settingsRes.json();
    const existingPin =
      (settingsJson.data?.serviceAreas as Array<{ pincode?: string }> | undefined)?.[0]?.pincode
      ?? '400001';
    await fetch('/api/v1/vendor/settings/service-areas', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode: existingPin }),
    });
    const pinConflict = await fetch('/api/v1/vendor/settings/service-areas', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode: existingPin }),
    });

    return {
      ok: true as const,
      storeA,
      storeB,
      supplierUserId,
      switchOk: switchRes.ok && switchJson.success === true,
      currentVendorId: getJson.data?.vendorId as string | undefined,
      hierarchyStores: (getJson.data?.stores as unknown[] | undefined)?.length ?? 0,
      businessesCount: bizList.length,
      pinConflictStatus: pinConflict.status,
      pinConflictOk: (await pinConflict.json().catch(() => ({}))).success === true,
    };
  });

  expect(flow.ok, flow.ok ? '' : flow.reason).toBeTruthy();
  if (!flow.ok) return;
  expect(flow.switchOk).toBeTruthy();
  expect(flow.currentVendorId).toBe(flow.storeB);
  expect(flow.hierarchyStores).toBeGreaterThanOrEqual(2);
  expect(flow.businessesCount).toBeGreaterThanOrEqual(1);
  expect(flow.pinConflictOk).toBeFalsy();
  expect(flow.pinConflictStatus).toBeGreaterThanOrEqual(400);

  await page.goto('/vendor/businesses', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /Businesses/i }).or(page.getByText(/Online Store/i)).first(),
  ).toBeVisible({ timeout: 45_000 });
});

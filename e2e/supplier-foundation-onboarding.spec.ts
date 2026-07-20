import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

test('supplier foundation APIs: businesses list + pincode conflict + go-live gate', async ({
  page,
}) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');
  await page.waitForLoadState('domcontentloaded');

  const vendorMeta = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=10', { credentials: 'include' });
    const json = await list.json();
    const vendors = json.data?.vendors ?? [];
    const v = vendors.find((x: { isActive?: boolean }) => x.isActive !== false) ?? vendors[0];
    if (!v?.id) return null;
    await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: v.id }),
    });
    return { id: v.id as string };
  });
  expect(vendorMeta?.id).toBeTruthy();

  const businesses = await page.evaluate(async () => {
    const res = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const json = await res.json();
    return { status: res.status, ok: json.success };
  });
  expect(businesses.status).toBe(200);
  expect(businesses.ok).toBeTruthy();

  const setup = await page.evaluate(async () => {
    const res = await fetch('/api/v1/vendor/setup', { credentials: 'include' });
    const json = await res.json();
    return { ok: json.success, steps: json.data?.steps as string[] | undefined };
  });
  expect(setup.ok).toBeTruthy();
  expect(setup.steps).toContain('go_live');

  const pinResult = await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/vendor/settings', { credentials: 'include' });
    const listJson = await listRes.json();
    const existing = (listJson.data?.serviceAreas ?? []) as Array<{ pincode?: string }>;
    const pin = existing[0]?.pincode ?? '400001';
    await fetch('/api/v1/vendor/settings/service-areas', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode: pin }),
    });
    const second = await fetch('/api/v1/vendor/settings/service-areas', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode: pin }),
    });
    const secondJson = await second.json();
    return { secondOk: secondJson.success, secondStatus: second.status };
  });
  expect(pinResult.secondOk).toBeFalsy();
  expect(pinResult.secondStatus).toBeGreaterThanOrEqual(400);
});

test('supplier foundation: switch-online-store for vendor', async ({ page }) => {
  await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
  await page.goto('/vendor/overview', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const biz = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const bizJson = await biz.json();
    const storeId = bizJson.data?.[0]?.stores?.[0]?.id as string | undefined;
    if (!storeId) return { skipped: true as const };
    const res = await fetch('/api/v1/auth/switch-online-store', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: storeId }),
    });
    const body = await res.json();
    return {
      skipped: false as const,
      status: res.status,
      ok: body.success === true,
      vendorId: body.data?.vendorId as string | undefined,
    };
  });

  if (!result.skipped) {
    expect(result.status).toBe(200);
    expect(result.ok).toBeTruthy();
    expect(result.vendorId).toBeTruthy();
  }
});

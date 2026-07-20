import { test, expect } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

test('team invite accepts business vs store scope fields', async ({ page }) => {
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  const result = await page.evaluate(async () => {
    const list = await fetch('/api/v1/admin/vendors?limit=5', { credentials: 'include' });
    const json = await list.json();
    const v = (json.data?.vendors ?? [])[0];
    if (!v?.id) return { skipped: true as const };

    await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: v.id }),
    });

    const roles = await fetch('/api/v1/vendor/roles', { credentials: 'include' });
    const rolesJson = await roles.json();
    const roleId =
      (rolesJson.data ?? []).find((r: { name?: string }) => r.name === 'Vendor Viewer')?.id
      ?? (rolesJson.data ?? [])[0]?.id;

    const bad = await fetch('/api/v1/vendor/team', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'x', roleId, scope: 'business' }),
    });
    const badJson = await bad.json();

    const storeScope = await fetch('/api/v1/vendor/team', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'ab', roleId, scope: 'store' }),
    });

    return {
      skipped: false as const,
      hasRole: !!roleId,
      badStatus: bad.status,
      storeStatus: storeScope.status,
      badOk: badJson.success === true,
    };
  });

  if (!result.skipped) {
    expect(result.hasRole).toBeTruthy();
    expect(result.badOk).toBeFalsy();
    expect(result.badStatus).toBeGreaterThanOrEqual(400);
    expect(result.storeStatus).toBeGreaterThanOrEqual(400);
  }
});

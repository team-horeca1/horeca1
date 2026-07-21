import type { Page } from '@playwright/test';

/** True when Playwright is aimed at the live freshville host. */
export function isProductionE2ETarget(baseURL = process.env.PLAYWRIGHT_BASE_URL ?? ''): boolean {
  try {
    const u = new URL(baseURL);
    return u.protocol === 'https:' && /freshville\.store|64\.227\.187\.210/i.test(u.host);
  } catch {
    return false;
  }
}

/** Prefer the seed Daily Fresh business when the post-login picker / E2E biz noise appears. */
export async function ensureDailyFreshVendorContext(page: Page) {
  // Account picker overlay (mandatory when multiple BAs exist)
  const pick = page.getByRole('button', { name: /Daily Fresh Foods/i });
  if (await pick.first().isVisible({ timeout: 2_500 }).catch(() => false)) {
    await pick.first().click();
    await page.waitForTimeout(600);
  }

  await page.evaluate(async () => {
    const listRes = await fetch('/api/v1/supplier/businesses', { credentials: 'include' });
    const listJson = await listRes.json();
    const rows = (listJson.data ?? []) as Array<{
      id: string;
      legalName?: string;
      displayName?: string | null;
      stores?: Array<{ id: string; isActive?: boolean; isVerified?: boolean }>;
    }>;
    const daily =
      rows.find(
        (b) =>
          /daily fresh/i.test(b.legalName ?? '')
          || /daily fresh/i.test(b.displayName ?? ''),
      ) ?? rows[0];
    if (!daily?.id) return;

    await fetch('/api/v1/auth/switch-business-account', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessAccountId: daily.id }),
    }).catch(() => null);

    const store =
      daily.stores?.find((s) => s.isVerified)
      ?? daily.stores?.find((s) => s.isActive !== false)
      ?? daily.stores?.[0];
    if (store?.id) {
      await fetch('/api/v1/auth/switch-online-store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: store.id }),
      }).catch(() => null);
    }
  });

  // Hard reload so vendor layout re-reads session (clears pending-application gate)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  if (await pick.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await pick.first().click();
    await page.waitForTimeout(500);
  }

  // Account picker modal (Welcome back)
  const dailyCard = page.getByRole('button', { name: /Daily Fresh Foods/i });
  if (await dailyCard.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dailyCard.first().click();
    await page.waitForTimeout(600);
  }
}

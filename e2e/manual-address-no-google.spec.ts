import { expect, test } from '@playwright/test';

/**
 * Customer signup and public pages must use typed addresses.
 * Google Maps must not load.
 */
test('customer signup asks for one contact person and no Google address', async ({ page }) => {
  await page.goto('/register?role=customer');
  await expect(page.getByText('Restaurant / Business Name')).toBeVisible();
  await expect(page.getByText('Contact person')).toBeVisible();
  await expect(page.getByText('Mobile Number')).toBeVisible();
  await expect(page.getByText(/^Pincode/)).toBeVisible();
  await expect(page.getByText('Email (optional)')).toBeVisible();
  await expect(page.getByText("Person's first name")).toHaveCount(0);
  await expect(page.getByText("Person's last name")).toHaveCount(0);
  await expect(page.getByText(/search from maps|search delivery location|pick from map/i)).toHaveCount(0);

  const html = await page.content();
  expect(html).not.toContain('maps.googleapis.com');
  expect(html).not.toContain('Search from maps');
});

test('vendor and brand register pages do not load Google Maps', async ({ page }) => {
  for (const path of ['/vendor/register', '/brand/register']) {
    await page.goto(path);
    const html = await page.content();
    expect(html).not.toContain('maps.googleapis.com');
    expect(html).not.toContain('Search from maps');
    expect(html).not.toContain('Search address or place name');
  }
});

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

const FEE_VENDOR = 'c1111111-1111-4111-8111-111111111111';

function dockerBin(): string {
  const local = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
  return fs.existsSync(local) ? local : 'docker';
}

function localPsql(sql: string): string {
  return execFileSync(
    dockerBin(),
    ['exec', '-i', 'horeca1-db', 'psql', '-U', 'horeca1', '-d', 'horeca1', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { encoding: 'utf8', input: sql },
  ).trim();
}

function seedLocalFeeExample() {
  const database = localPsql('SELECT current_database();');
  if (database !== 'horeca1') throw new Error(`Refusing to seed ${database}`);
  const sql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'seed-local-fee-example.sql'), 'utf8');
  localPsql(sql);
}

test('capture all finance screenshots for documentation', async ({ page }) => {
  seedLocalFeeExample();

  // 1. Admin login
  await passwordLogin(page, 'admin@horeca1.com', 'admin123');

  // 2. Admin Payables Dashboard (1440px)
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/admin/finance');
  await expect(page.getByRole('heading', { name: 'Pay suppliers' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-1440.png',
    fullPage: true,
  });

  // 3. Admin Payables Dashboard - Tablet & Mobile
  await page.setViewportSize({ width: 768, height: 960 });
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-768.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 960 });
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-390.png',
    fullPage: true,
  });

  // 4. Pay Supplier Modal (1440px)
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/admin/finance');
  await page.getByLabel('Search supplier').fill('Fee');
  const readyRow = page.getByRole('row', { name: /Fee Example Supply/ });
  await readyRow.getByRole('button', { name: 'Pay' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Bank reference').fill('HDFC-NEFT-984210');
  await dialog.getByLabel('Payment note').fill('Weekly settlement batch #42');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-modal-1440.png',
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // 5. Supplier Detail View (1440px)
  await page.goto(`/admin/finance/payables/${FEE_VENDOR}`);
  await expect(page.getByRole('heading', { name: 'Fee Example Supply' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-detail-1440.png',
    fullPage: true,
  });

  // 6. Supplier Detail View - Expanded Breakdown Drawer
  const viewBreakdownBtn = page.getByRole('button', { name: 'View breakdown' }).first();
  if (await viewBreakdownBtn.isVisible()) {
    await viewBreakdownBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/finance-ledger/screenshots/payables-detail-breakdown-1440.png',
      fullPage: true,
    });
  }

  // 7. Supplier Detail View Mobile (390px)
  await page.setViewportSize({ width: 390, height: 960 });
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/payables-detail-390.png',
    fullPage: true,
  });

  // 8. Supplier-facing Portal View (/vendor/receive)
  await page.setViewportSize({ width: 1440, height: 960 });
  await passwordLogin(page, 'fee-example-supply@example.com', 'vendor123');
  await page.goto('/vendor/receive');
  await expect(page.getByRole('heading', { name: 'What I receive' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/vendor-receive-1440.png',
    fullPage: true,
  });

  // 9. Supplier-facing Mobile View
  await page.setViewportSize({ width: 390, height: 960 });
  await page.screenshot({
    path: 'docs/finance-ledger/screenshots/vendor-receive-390.png',
    fullPage: true,
  });
});

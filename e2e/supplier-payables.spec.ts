import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { passwordLogin } from './helpers/auth';

const FEE_VENDOR = 'c1111111-1111-4111-8111-111111111111';
const FEE_ORDER = 'd1111111-1111-4111-8111-111111111111';
const FEE_PAYMENT = 'e1111111-1111-4111-8111-111111111111';

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

test.describe('Supplier payables', () => {
  test('finance screen loads, filters, and does not claim bank verification', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await passwordLogin(page, 'admin@horeca1.com', 'admin123');
    await page.goto('/admin/finance');
    await expect(page.getByRole('heading', { name: 'Pay suppliers' })).toBeVisible();
    await expect(page.getByText('We do not call the bank.')).toBeVisible();
    await expect(page.getByText('To pay').first()).toBeVisible();
    await expect(page.getByText('Razorpay cut').first()).toBeVisible();

    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: 'Pay suppliers' })).toBeVisible();
      await page.screenshot({
        path: `docs/finance-ledger/screenshots/payables-${width}.png`,
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel('Search supplier').fill('no-such-supplier-xyz');
    await expect(page.getByText('No supplier matches. Clear the search to see everyone.')).toBeVisible();

    const response = await page.request.get('/api/v1/admin/finance/payables');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.kpis.outstandingIsCurrent).toBe(true);

    expect(errors).toEqual([]);
  });

  test('pay uses the stored Razorpay fee, a note, and the invoice', async ({ page }) => {
    test.setTimeout(180_000);
    seedLocalFeeExample();
    const stored = localPsql(
      `SELECT razorpay_fee_paise::text || ',' || razorpay_tax_paise::text FROM payments WHERE id = '${FEE_PAYMENT}';`,
    );
    expect(stored).toBe('118,18');
    const missing = localPsql(
      `SELECT razorpay_fee_paise IS NULL FROM payments WHERE id = 'e2222222-2222-4222-8222-222222222222';`,
    );
    expect(missing).toBe('t');

    await passwordLogin(page, 'admin@horeca1.com', 'admin123');
    await page.goto('/admin/finance');
    await page.getByLabel('Search supplier').fill('Fee');

    const ready = page.getByRole('row', { name: /Fee Example Supply/ });
    await expect(ready.getByText('₹100.00').first()).toBeVisible();
    await expect(ready.getByText('₹1.18')).toBeVisible();
    await expect(ready.getByText('₹10.00')).toBeVisible();
    await expect(ready.getByText('₹88.82')).toBeVisible();
    await expect(ready.getByRole('link', { name: 'Invoice' })).toHaveCount(0);

    const blocked = page.getByRole('row', { name: /Missing Fee Supply/ });
    await expect(blocked.getByText('Fee missing')).toBeVisible();
    await expect(blocked.getByRole('button', { name: 'Pay' })).toBeDisabled();

    await ready.getByRole('link', { name: 'Fee Example Supply' }).click();
    await expect(page.getByRole('heading', { name: 'Fee Example Supply' })).toBeVisible();
    await expect(page.getByRole('row', { name: /PO-FEE-100/ }).getByRole('link', { name: 'Payment invoice' })).toBeVisible();
    await page.goto('/admin/finance');

    const invoice = await page.request.get(`/api/v1/admin/orders/${FEE_ORDER}/invoice`);
    expect(invoice.ok()).toBeTruthy();
    expect(invoice.headers()['content-type'] ?? '').toContain('application/pdf');

    await page.goto(`/admin/vendors/${FEE_VENDOR}`);
    await expect(page.getByRole('heading', { name: 'Supplier commission' })).toBeVisible();
    await page.getByRole('button', { name: 'Custom rate' }).click();
    await page.locator('#supplier-commission-rate').fill('12');
    await page.locator('#supplier-commission-reason').fill('Local pay breakdown check');
    await page.getByRole('button', { name: 'Save commission' }).click();
    await expect(page.getByText('Supplier commission saved')).toBeVisible();

    const history = localPsql(
      `SELECT rate_pct::text || CASE WHEN effective_to IS NULL THEN ':open' ELSE ':closed' END
       FROM supplier_commission_agreements
       WHERE vendor_id = '${FEE_VENDOR}'
       ORDER BY effective_from;`,
    );
    expect(history).toContain('10');
    expect(history).toContain('12');
    expect(history).toContain(':open');
    expect(history).toContain(':closed');

    await page.goto('/admin/finance');
    await page.getByLabel('Search supplier').fill('Fee Example');
    const still = page.getByRole('row', { name: /Fee Example Supply/ });
    await expect(still.getByText('₹10.00')).toBeVisible();
    await expect(still.getByText('₹88.82')).toBeVisible();
    await expect(still.getByText('₹12.00')).toHaveCount(0);

    await still.getByRole('button', { name: 'Pay' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Bank reference').fill('FEELOCALUTR1');
    await dialog.getByLabel('Payment note').fill('Local fee note');
    await dialog.getByRole('button', { name: 'Mark paid' }).click();
    await expect(dialog.getByText('Paid. The reference is saved.')).toBeVisible();

    await expect.poll(() => localPsql(
      `SELECT count(*) FROM audit_logs
       WHERE action = 'supplier_settlement.settle'
         AND after->>'utr' = 'FEELOCALUTR1'
         AND after->>'note' = 'Local fee note'
         AND after->>'supplierId' = '${FEE_VENDOR}';`,
    )).toBe('1');
    await expect.poll(() => localPsql(
      `SELECT (before->>'platformFeePct') || '>' || (after->>'platformFeePct')
       FROM audit_logs
       WHERE action = 'supplier_commission.update' AND entity_id = '${FEE_VENDOR}'
       ORDER BY at DESC LIMIT 1;`,
    )).toContain('>12.00');

    await passwordLogin(page, 'fee-example-supply@example.com', 'vendor123');
    await page.goto('/vendor/receive');
    await expect(page.getByRole('heading', { name: 'What I receive' })).toBeVisible();
    const mine = page.getByRole('row', { name: /PO-FEE-100/ });
    await expect(mine.getByText('₹100.00').first()).toBeVisible();
    await expect(mine.getByText('₹1.18')).toBeVisible();
    await expect(mine.getByText('₹10.00')).toBeVisible();
    await expect(mine.getByText('₹88.82 · Paid')).toBeVisible();
    const vendorInvoice = await page.request.get(`/api/v1/vendor/orders/${FEE_ORDER}/invoice`);
    expect(vendorInvoice.ok()).toBeTruthy();
    expect(vendorInvoice.headers()['content-type'] ?? '').toContain('application/pdf');
  });

  test('anonymous callers cannot read payables', async ({ request }) => {
    const response = await request.get('/api/v1/admin/finance/payables');
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

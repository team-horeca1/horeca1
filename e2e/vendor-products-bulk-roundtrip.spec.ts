import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { passwordLogin } from './helpers/auth';
import { ensureDailyFreshVendorContext } from './helpers/supplierPortal';

test.describe.configure({ timeout: 180_000, mode: 'serial' });

async function enterStore(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('horeca_supplier_entered_store', '1');
    } catch {
      /* ignore */
    }
  });
}

async function openProducts(page: import('@playwright/test').Page) {
  await ensureDailyFreshVendorContext(page);
  await enterStore(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/vendor/products', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(1000 * (attempt + 1));
    }
  }
  await expect(page.getByRole('heading', { name: /Products/i }).first()).toBeVisible({
    timeout: 60_000,
  });

  for (let attempt = 0; attempt < 8; attempt++) {
    const warm = await page.evaluate(async () => {
      const listRes = await fetch('/api/v1/vendor/products?limit=5', { credentials: 'include' });
      return listRes.status;
    });
    if (warm !== 404) break;
    await page.waitForTimeout(1500);
  }
}

function bufferToBase64(buf: Buffer): string {
  return buf.toString('base64');
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

test.describe('Product approval narrowing + bulk export/import', () => {
  test.beforeEach(async ({ page }) => {
    await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
    await ensureDailyFreshVendorContext(page);
    await enterStore(page);
  });

  test('PATCH vegNonVeg applies live — stays approved (no pending_edit)', async ({ page }) => {
    await openProducts(page);

    const result = await page.evaluate(async () => {
      const listRes = await fetch('/api/v1/vendor/products?limit=20', { credentials: 'include' });
      const listJson = await listRes.json();
      const products = (
        Array.isArray(listJson.data) ? listJson.data : listJson.data?.products ?? []
      ) as Array<{ id: string; approvalStatus?: string; vegNonVeg?: string | null }>;

      const target =
        products.find((p) => p.approvalStatus === 'approved') ?? products[0] ?? null;
      if (!target) return { ok: false as const, reason: 'no products' };

      // Ensure approved baseline if somehow pending_edit from prior runs
      const before = await (
        await fetch(`/api/v1/vendor/products/${target.id}`, { credentials: 'include' })
      ).json();
      const current = before.data as {
        id: string;
        approvalStatus: string;
        vegNonVeg?: string | null;
      };
      if (current.approvalStatus !== 'approved') {
        return {
          ok: false as const,
          reason: `product ${current.id} is ${current.approvalStatus}, need approved`,
        };
      }

      const nextVeg =
        current.vegNonVeg === 'nonveg' ? 'veg' : current.vegNonVeg === 'egg' ? 'veg' : 'nonveg';

      const patch = await (
        await fetch(`/api/v1/vendor/products/${current.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vegNonVeg: nextVeg }),
        })
      ).json();

      return {
        ok: true as const,
        productId: current.id,
        success: patch.success as boolean | undefined,
        error: patch.error?.message as string | undefined,
        approvalStatus: patch.data?.approvalStatus as string | undefined,
        vegNonVeg: patch.data?.vegNonVeg as string | undefined,
        expectedVeg: nextVeg,
        pendingEditPayload: patch.data?.pendingEditPayload ?? null,
      };
    });

    test.skip(!result.ok, result.ok === false ? result.reason : 'skip');
    expect(result.ok && result.success, result.ok ? result.error : '').toBe(true);
    expect(result.ok && result.approvalStatus).toBe('approved');
    expect(result.ok && result.vegNonVeg).toBe(result.ok ? result.expectedVeg : '');
    expect(result.ok && result.pendingEditPayload).toBeFalsy();
  });

  test('PATCH imageUrl queues pending_edit — live image unchanged until admin approves', async ({
    page,
  }) => {
    await openProducts(page);

    const result = await page.evaluate(async () => {
      const listRes = await fetch('/api/v1/vendor/products?limit=20', { credentials: 'include' });
      const listJson = await listRes.json();
      const products = (
        Array.isArray(listJson.data) ? listJson.data : listJson.data?.products ?? []
      ) as Array<{ id: string; approvalStatus?: string }>;

      const target =
        products.find((p) => p.approvalStatus === 'approved') ?? products[0] ?? null;
      if (!target) return { ok: false as const, reason: 'no products' };

      const before = await (
        await fetch(`/api/v1/vendor/products/${target.id}`, { credentials: 'include' })
      ).json();
      const current = before.data as {
        id: string;
        approvalStatus: string;
        imageUrl?: string | null;
        pendingEditPayload?: unknown;
      };
      if (current.approvalStatus !== 'approved') {
        return {
          ok: false as const,
          reason: `product ${current.id} is ${current.approvalStatus}, need approved`,
        };
      }

      const newUrl = `/images/seed/e2e-pending-edit-${Date.now()}.png`;
      const patch = await (
        await fetch(`/api/v1/vendor/products/${current.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: newUrl }),
        })
      ).json();

      return {
        ok: true as const,
        productId: current.id,
        success: patch.success as boolean | undefined,
        error: patch.error?.message as string | undefined,
        approvalStatus: patch.data?.approvalStatus as string | undefined,
        liveImageUrl: patch.data?.imageUrl as string | null | undefined,
        previousImageUrl: current.imageUrl,
        pendingImageUrl: (patch.data?.pendingEditPayload as { imageUrl?: string } | null)
          ?.imageUrl,
        expectedPendingUrl: newUrl,
      };
    });

    test.skip(!result.ok, result.ok === false ? result.reason : 'skip');
    expect(result.ok && result.success, result.ok ? result.error : '').toBe(true);
    expect(result.ok && result.approvalStatus).toBe('pending_edit');
    expect(result.ok && result.pendingImageUrl).toBe(result.ok ? result.expectedPendingUrl : '');
    // Live image should stay the previous one (material field stripped)
    expect(result.ok && result.liveImageUrl).toBe(result.ok ? result.previousImageUrl : '');

    // Cleanup: admin rejects pending_edit so catalog stays approved for later tests
    await passwordLogin(page, 'admin@horeca1.com', 'admin123');
    const rejected = await page.evaluate(async (productId) => {
      const res = await fetch(`/api/v1/admin/products/${productId}/approval`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: 'e2e cleanup pending_edit' }),
      });
      return { status: res.status, ...(await res.json()) };
    }, result.ok ? result.productId : '');
    expect(rejected.success, JSON.stringify(rejected)).toBe(true);
    expect(rejected.data?.approvalStatus).toBe('approved');
  });

  test('export → modify veg/price → reupload updates products without pending_edit', async ({
    page,
  }) => {
    await openProducts(page);

    // Clear leftover pending_edit from prior image tests so roundtrip asserts stay clean
    const pendingIds = await page.evaluate(async () => {
      const listRes = await fetch('/api/v1/vendor/products?limit=50', { credentials: 'include' });
      const listJson = await listRes.json();
      const products = (
        Array.isArray(listJson.data) ? listJson.data : listJson.data?.products ?? []
      ) as Array<{ id: string; approvalStatus?: string }>;
      return products.filter((p) => p.approvalStatus === 'pending_edit').map((p) => p.id);
    });
    if (pendingIds.length > 0) {
      await passwordLogin(page, 'admin@horeca1.com', 'admin123');
      await page.evaluate(async (ids) => {
        for (const id of ids) {
          await fetch(`/api/v1/admin/products/${id}/approval`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject', note: 'e2e clear pending_edit before bulk' }),
          });
        }
      }, pendingIds);
      await passwordLogin(page, 'fresh@dailyfreshfoods.com', 'vendor123');
      await ensureDailyFreshVendorContext(page);
      await enterStore(page);
      await openProducts(page);
    }

    const exported = await page.evaluate(async () => {
      const res = await fetch('/api/v1/vendor/products/export?format=xlsx', {
        credentials: 'include',
      });
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      return {
        status: res.status,
        b64: btoa(binary),
        bytes: bytes.length,
      };
    });
    expect(exported.status).toBe(200);
    expect(exported.bytes).toBeGreaterThan(100);

    const wb = XLSX.read(base64ToBuffer(exported.b64), { type: 'buffer' });
    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase() === 'products') ??
      wb.SheetNames.find((n) => n.toLowerCase() !== 'categories') ??
      wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName!];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    expect(rows.length).toBeGreaterThan(0);

    const expected: Array<{ sku: string; veg: string; name: string }> = [];
    const mutateCount = Math.min(3, rows.length);

    for (let i = 0; i < mutateCount; i++) {
      const row = rows[i]!;
      const sku = String(row.SKU ?? '').trim();
      const name = String(row['Item Name'] ?? row['Product Name'] ?? '').trim();
      expect(sku || name).toBeTruthy();

      const currentVeg = String(row['Veg / Non-Veg'] ?? '')
        .trim()
        .toLowerCase();
      const nextVeg = currentVeg === 'nonveg' || currentVeg === 'non-veg' ? 'veg' : 'nonveg';
      row['Veg / Non-Veg'] = nextVeg;

      const priceKey =
        Object.keys(row).find((k) => k === 'Taxable Rate') ??
        Object.keys(row).find((k) => /taxable rate/i.test(k) || k === 'Net Rate');
      if (priceKey) {
        const n = Number(row[priceKey]);
        if (Number.isFinite(n) && n > 0) {
          row[priceKey] = Math.round((n + 1) * 100) / 100;
        }
      }

      expected.push({ sku, veg: nextVeg, name });
    }

    // Keep full workbook (incl. Categories sheet) — only Products rows are rewritten
    wb.Sheets[sheetName!] = XLSX.utils.json_to_sheet(rows);
    const outBuf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const outB64 = bufferToBase64(outBuf);

    const commit = await page.evaluate(async (b64) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'products-roundtrip.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'commit');
      fd.append('force', 'true');
      const res = await fetch('/api/v1/vendor/products/import', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const json = await res.json();
      return { status: res.status, json };
    }, outB64);

    expect(commit.status).toBe(200);
    expect(commit.json.success, JSON.stringify(commit.json)).toBe(true);
    const data = commit.json.data as {
      blocked?: boolean;
      created?: number;
      updated?: number;
      errors?: Array<{ row: number; message: string }>;
    };
    expect(
      data.updated ?? 0,
      `updated=0 created=${data.created} blocked=${data.blocked} errors=${JSON.stringify(data.errors)}`,
    ).toBeGreaterThanOrEqual(1);
    // Prefer updates; allow zero creates (no duplicate listings)
    expect(data.created ?? 0).toBe(0);

    const verified = await page.evaluate(async (targets) => {
      const listRes = await fetch('/api/v1/vendor/products?limit=50', { credentials: 'include' });
      const listJson = await listRes.json();
      const products = (
        Array.isArray(listJson.data) ? listJson.data : listJson.data?.products ?? []
      ) as Array<{
        id: string;
        sku?: string | null;
        vendorSku?: string | null;
        name: string;
        vegNonVeg?: string | null;
        approvalStatus?: string;
      }>;

      const out = [];
      for (const t of targets) {
        const match = products.find(
          (p) =>
            (t.sku &&
              (p.sku?.toLowerCase() === t.sku.toLowerCase() ||
                p.vendorSku?.toLowerCase() === t.sku.toLowerCase())) ||
            p.name.toLowerCase() === t.name.toLowerCase(),
        );
        if (!match) {
          out.push({ sku: t.sku, found: false });
          continue;
        }
        const detail = await (
          await fetch(`/api/v1/vendor/products/${match.id}`, { credentials: 'include' })
        ).json();
        out.push({
          sku: t.sku,
          found: true,
          vegNonVeg: detail.data?.vegNonVeg,
          approvalStatus: detail.data?.approvalStatus,
          expectedVeg: t.veg,
        });
      }
      return out;
    }, expected);

    const matched = verified.filter((v) => v.found);
    expect(matched.length).toBeGreaterThanOrEqual(1);
    for (const v of matched) {
      expect(v.approvalStatus, `sku=${v.sku}`).toBe('approved');
      expect(v.vegNonVeg, `sku=${v.sku}`).toBe(v.expectedVeg);
    }

    await page.getByRole('button', { name: 'Bulk Update', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Import$/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

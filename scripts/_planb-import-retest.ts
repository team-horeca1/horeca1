/**
 * Integration retest for Plan B product import timeout fix.
 * Run: npx tsx scripts/_planb-import-retest.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma';
import { parseProductImport } from '../src/modules/import-export/excel.service';
import { IMPORT_TX_OPTS } from '../src/modules/import-export/import-commit';
import {
  assertLeafCategory,
  composeVendorListingSku,
  findOrCreateMaster,
  resolveImportCategoryIds,
  syncImportProductCategories,
} from '../src/modules/catalog/catalog.service';
import { findOrCreateBrandByName } from '../src/modules/brand/brand.service';
import { ensureInventoryForAllOutlets } from '../src/lib/inventoryOutlet';
import { friendlyErrorMessage } from '../src/middleware/errorHandler';

const TAG = 'planb-import-retest';
const buf = readFileSync(resolve(process.cwd(), 'error/PlanB_import_template.xlsx'));

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  const { rows, errors } = parseProductImport(buf);
  console.log('PARSE', { count: rows.length, errors: errors.length, sheetRows: rows.map((r) => r.sheetRow) });
  if (errors.length || rows.length !== 11) {
    throw new Error('Parse failed — expected 11 rows, 0 errors');
  }
  if (JSON.stringify(rows.map((r) => r.sheetRow)) !== JSON.stringify([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])) {
    throw new Error('Unexpected sheetRow numbers');
  }

  const vendor = await prisma.vendor.findFirst({
    select: { id: true, vendorCode: true, businessAccountId: true, businessName: true },
  });
  if (!vendor) throw new Error('No vendor');
  console.log('VENDOR', vendor.businessName, vendor.id);

  // Cleanup any prior retest products for this vendor (by SKU)
  const skus = rows.map((r) => r.sku!).filter(Boolean);
  await prisma.product.deleteMany({
    where: {
      vendorId: vendor.id,
      OR: [{ vendorSku: { in: skus } }, { name: { startsWith: 'Plan B Vegan' } }],
    },
  });

  const allCategories = await prisma.category.findMany({
    where: { isActive: true, approvalStatus: 'approved' },
    select: { id: true, name: true, slug: true },
  });
  const catMap = new Map<string, string>();
  for (const c of allCategories) {
    catMap.set(c.name.toLowerCase(), c.id);
    catMap.set(c.slug.toLowerCase(), c.id);
  }

  const usedSlugs = new Set(
    (await prisma.product.findMany({ where: { vendorId: vendor.id }, select: { slug: true } })).map((p) => p.slug),
  );
  function uniqueSlug(name: string): string {
    const base = toSlug(name) || 'product';
    let candidate = base;
    let n = 2;
    while (usedSlugs.has(candidate)) candidate = `${base}-${n++}`;
    usedSlugs.add(candidate);
    return candidate;
  }

  // ── CREATE pass (mirrors vendor/admin commit with IMPORT_TX_OPTS + tx-aware master) ──
  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      if (r.brand) await findOrCreateBrandByName({ name: r.brand, autoApprove: true });
      const resolved = await resolveImportCategoryIds({
        parentCategory: r.parentCategory,
        subCategory: r.subCategory,
        additionalSubCategories: r.additionalSubCategories,
        legacyCategory: r.legacyCategory,
        autoApprove: true,
        catMap,
      });
      const categoryId = resolved.primaryCategoryId;
      if (!categoryId) throw new Error(`No category for ${r.name}`);
      await assertLeafCategory(resolved.categoryIds, tx);

      const masterProductId = await findOrCreateMaster(
        { name: r.name, brand: r.brand ?? null, categoryId },
        tx,
      );
      const vendorSku = r.sku!.trim();
      const composedSku = await composeVendorListingSku(vendor.id, vendorSku, undefined, tx);

      const product = await tx.product.create({
        data: {
          vendorId: vendor.id,
          categoryId,
          masterProductId,
          name: r.name,
          slug: uniqueSlug(r.name),
          sku: composedSku,
          vendorSku,
          hsn: r.hsn || null,
          unit: r.unit || null,
          brand: r.brand || null,
          basePrice: r.basePrice,
          taxPercent: r.taxPercent,
          approvalStatus: 'approved',
          metadata: { retestTag: TAG },
          minOrderQty: r.moq || 1,
          packSize: r.packSize || null,
          storageType: r.storageType || null,
          creditEligible: true,
          isActive: true,
        },
      });
      await ensureInventoryForAllOutlets(
        product.id,
        vendor.id,
        vendor.businessAccountId,
        { initialQty: r.stock ?? 0 },
        tx,
      );
      if (resolved.categoryIds.length > 0) {
        await syncImportProductCategories(product.id, resolved.categoryIds, tx);
      }
      created++;
    }
  }, IMPORT_TX_OPTS);
  console.log('CREATE', { created });
  if (created !== 11) throw new Error(`Expected 11 created, got ${created}`);

  // ── UPDATE pass (same file again) ──
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const existing = await tx.product.findFirst({
        where: { vendorId: vendor.id, vendorSku: r.sku },
        select: { id: true },
      });
      if (!existing) throw new Error(`Missing ${r.sku} after create`);
      await tx.product.update({
        where: { id: existing.id },
        data: { basePrice: r.basePrice, taxPercent: r.taxPercent },
      });
      updated++;
    }
  }, IMPORT_TX_OPTS);
  console.log('UPDATE', { updated });
  if (updated !== 11) throw new Error(`Expected 11 updated, got ${updated}`);

  // ── Forced timeout: 1ms budget must fail honestly ──
  let timedOut = false;
  let timeoutMsg = '';
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_sleep(0.05)');
        await tx.product.findFirst({ where: { vendorId: vendor.id } });
      },
      { maxWait: 5_000, timeout: 1 },
    );
  } catch (err) {
    timedOut = true;
    timeoutMsg = friendlyErrorMessage(err, 'unexpected');
  }
  console.log('TIMEOUT', { timedOut, timeoutMsg });
  if (!timedOut) throw new Error('Expected 1ms transaction to time out');
  if (/delete/i.test(timeoutMsg)) throw new Error(`P2028 still says delete: ${timeoutMsg}`);
  if (!/took too long/i.test(timeoutMsg)) throw new Error(`Unexpected timeout message: ${timeoutMsg}`);

  // Cleanup retest products
  await prisma.product.deleteMany({
    where: { vendorId: vendor.id, vendorSku: { in: skus } },
  });
  console.log('OK — Plan B import retest passed');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

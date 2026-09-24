/**
 * Full local regression: parse → create 11 → visible to vendor → re-import update →
 * delete one → no brand/catalog ghosts → forced timeout honest.
 *
 * Run: npx tsx scripts/_full-planb-regression.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma';
import { parseProductImport } from '../src/modules/import-export/excel.service';
import { IMPORT_TX_OPTS } from '../src/modules/import-export/import-commit';
import {
  assertLeafCategory,
  CatalogService,
  composeVendorListingSku,
  findOrCreateMaster,
  resolveImportCategoryIds,
  syncImportProductCategories,
} from '../src/modules/catalog/catalog.service';
import {
  findOrCreateBrandByName,
  syncProductToBrand,
} from '../src/modules/brand/brand.service';
import { ensureInventoryForAllOutlets } from '../src/lib/inventoryOutlet';
import { friendlyErrorMessage } from '../src/middleware/errorHandler';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  const buf = readFileSync(resolve(process.cwd(), 'error/PlanB_import_template.xlsx'));
  const { rows, errors } = parseProductImport(buf);
  console.log('1. PARSE', { count: rows.length, errors: errors.length, sheetRows: rows.map((r) => r.sheetRow) });
  if (errors.length || rows.length !== 11) throw new Error('parse failed');
  if (rows[0]!.sheetRow !== 3) throw new Error('sheetRow should start at 3');

  const vendor = await prisma.vendor.findFirst({
    select: { id: true, businessAccountId: true, businessName: true },
  });
  if (!vendor) throw new Error('no vendor');

  // Clean prior Plan B retest listings for this vendor
  const skus = rows.map((r) => r.sku!).filter(Boolean);
  const old = await prisma.product.findMany({
    where: { vendorId: vendor.id, OR: [{ vendorSku: { in: skus } }, { name: { startsWith: 'Plan B Vegan' } }] },
    select: { id: true },
  });
  const catalog = new CatalogService();
  for (const p of old) {
    await catalog.deleteProduct(p.id, vendor.id).catch(() => {});
  }

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

  await findOrCreateBrandByName({ name: 'Plan B', autoApprove: true });

  const createdIds: string[] = [];
  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const resolved = await resolveImportCategoryIds({
        parentCategory: r.parentCategory,
        subCategory: r.subCategory,
        additionalSubCategories: r.additionalSubCategories,
        legacyCategory: r.legacyCategory,
        autoApprove: true,
        catMap,
      });
      const categoryId = resolved.primaryCategoryId;
      if (!categoryId) throw new Error(`no category for ${r.name}`);
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
          isActive: true,
          minOrderQty: r.moq || 1,
          packSize: r.packSize || null,
          storageType: r.storageType || null,
        },
      });
      await ensureInventoryForAllOutlets(
        product.id,
        vendor.id,
        vendor.businessAccountId,
        { initialQty: r.stock ?? 0 },
        tx,
      );
      if (resolved.categoryIds.length) {
        await syncImportProductCategories(product.id, resolved.categoryIds, tx);
      }
      createdIds.push(product.id);
      created++;
    }
  }, IMPORT_TX_OPTS);
  console.log('2. CREATE', { created });
  if (created !== 11) throw new Error('expected 11 created');

  // Post-commit brand sync (same as fixed admin import)
  for (const id of createdIds) {
    const p = await prisma.product.findUniqueOrThrow({ where: { id } });
    await syncProductToBrand(
      p.brand,
      p.name,
      p.categoryId,
      p.imageUrl,
      p.packSize,
      p.unit,
      p.sku,
      p.masterProductId || undefined,
      p.id,
    );
  }

  const visible = await catalog.getVendorProducts(vendor.id, {
    limit: 500,
    includeInactive: true,
    aggregateStock: true,
  });
  const planBVisible = (visible.products as Array<{ name: string }>).filter((p) =>
    p.name.startsWith('Plan B Vegan'),
  );
  console.log('3. VENDOR LIST', { planBVisible: planBVisible.length });
  if (planBVisible.length < 11) throw new Error('vendor list missing Plan B products');

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const existing = await tx.product.findFirst({
        where: { vendorId: vendor.id, vendorSku: r.sku },
        select: { id: true },
      });
      if (!existing) throw new Error(`missing ${r.sku}`);
      await tx.product.update({
        where: { id: existing.id },
        data: { basePrice: r.basePrice },
      });
      updated++;
    }
  }, IMPORT_TX_OPTS);
  console.log('4. RE-IMPORT UPDATE', { updated });
  if (updated !== 11) throw new Error('expected 11 updates');

  // Delete first product — ghosts must go
  const first = await prisma.product.findFirstOrThrow({
    where: { id: createdIds[0] },
    select: { id: true, name: true, masterProductId: true },
  });
  await catalog.deleteProduct(first.id, vendor.id);
  const bmpLeft = await prisma.brandMasterProduct.count({
    where: { name: first.name },
  });
  const master = first.masterProductId
    ? await prisma.masterProduct.findUnique({
        where: { id: first.masterProductId },
        select: { isActive: true },
      })
    : null;
  console.log('5. DELETE CLEANUP', { bmpLeft, masterActive: master?.isActive });
  if (bmpLeft !== 0) throw new Error('brand ghost remained after delete');
  if (master && master.isActive !== false) throw new Error('master still active after last listing deleted');

  // Honest timeout message
  let timeoutMsg = '';
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_sleep(0.05)');
        await tx.product.findFirst();
      },
      { maxWait: 5000, timeout: 1 },
    );
  } catch (err) {
    timeoutMsg = friendlyErrorMessage(err, 'x');
  }
  console.log('6. TIMEOUT MSG', timeoutMsg);
  if (/delete/i.test(timeoutMsg)) throw new Error('still says Delete');
  if (!/took too long/i.test(timeoutMsg)) throw new Error('unexpected timeout msg');

  // Cleanup remaining Plan B products from this vendor
  const rest = await prisma.product.findMany({
    where: { vendorId: vendor.id, name: { startsWith: 'Plan B Vegan' }, slug: { not: { startsWith: '_deleted_' } } },
    select: { id: true },
  });
  for (const p of rest) await catalog.deleteProduct(p.id, vendor.id).catch(() => {});

  console.log('OK — full Plan B regression passed');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

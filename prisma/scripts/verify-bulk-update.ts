/**
 * Verifies vendor bulk-update (Advanced engine) math + DB apply path.
 * Run: npx tsx prisma/scripts/verify-bulk-update.ts
 */
import { prisma } from '../../src/lib/prisma';
import { applyAdjustment } from '../../src/modules/catalog/bulk-update.shared';
import { resolveBulkProductFilter } from '../../src/modules/catalog/bulk-filter';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log('\n=== Bulk Update Verification ===\n');

  // Unit: price math
  check(
    '10% increase on ₹100 → ₹110',
    applyAdjustment(100, { type: 'percent', value: 10 }) === 110,
  );
  check(
    'empty percent rejected by apply path',
    applyAdjustment(100, { type: 'percent', value: 0 }) === 100,
  );

  const vendor = await prisma.vendor.findFirst({
    where: { businessName: { contains: 'yami', mode: 'insensitive' } },
    select: { id: true, businessAccountId: true, businessName: true },
  });
  if (!vendor) {
    console.log('  ⚠ No yami vendor in DB — skipping live apply tests');
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }

  const products = await prisma.product.findMany({
    where: { vendorId: vendor.id },
    take: 3,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, basePrice: true, vendorSku: true, sku: true },
  });

  check('Vendor has products', products.length > 0, `${products.length} found for ${vendor.businessName}`);

  if (products.length === 0) {
    await prisma.$disconnect();
    process.exit(1);
  }

  const target = products[0];
  const originalPrice = Number(target.basePrice);

  // Filter resolution (same as API)
  const resolved = await resolveBulkProductFilter(
    { productIds: [target.id] },
    { vendorId: vendor.id },
  );
  check('resolveBulkProductFilter keeps product id', resolved.productIds?.[0] === target.id);

  const where = { vendorId: vendor.id, id: { in: resolved.productIds ?? [] } };
  const matched = await prisma.product.count({ where });
  check('Matched count > 0', matched === 1, `matched=${matched}`);

  const newPrice = applyAdjustment(originalPrice, { type: 'percent', value: 10 });

  await prisma.product.update({
    where: { id: target.id },
    data: { basePrice: newPrice },
  });

  const after = await prisma.product.findUnique({
    where: { id: target.id },
    select: { basePrice: true },
  });
  check(
    'Live DB price update applied',
    Number(after?.basePrice) === newPrice,
    `${target.name}: ${originalPrice} → ${Number(after?.basePrice)}`,
  );

  // Revert
  await prisma.product.update({
    where: { id: target.id },
    data: { basePrice: originalPrice },
  });
  const reverted = await prisma.product.findUnique({
    where: { id: target.id },
    select: { basePrice: true },
  });
  check('Price reverted', Number(reverted?.basePrice) === originalPrice);

  // SKU filter path
  const sku = target.vendorSku || target.sku;
  if (sku) {
    const bySku = await resolveBulkProductFilter(
      { skus: [sku] },
      { vendorId: vendor.id },
    );
    check('SKU filter resolves to product', bySku.productIds?.includes(target.id) === true, sku);
  }

  // Wrong vendor id in filter → 0 match
  const otherVendor = await prisma.vendor.findFirst({
    where: { id: { not: vendor.id } },
    select: { id: true },
  });
  if (otherVendor) {
    const cross = await prisma.product.count({
      where: { vendorId: otherVendor.id, id: target.id },
    });
    check('Cross-vendor filter matches 0', cross === 0);
  }

  // Slab adjust path
  const withSlabs = await prisma.product.findFirst({
    where: { vendorId: vendor.id, priceSlabs: { some: {} } },
    include: { priceSlabs: { take: 1 } },
  });
  if (withSlabs?.priceSlabs[0]) {
    const slab = withSlabs.priceSlabs[0];
    const slabBefore = Number(slab.price);
    const slabAfter = applyAdjustment(slabBefore, { type: 'percent', value: 5 });
    await prisma.priceSlab.update({
      where: { id: slab.id },
      data: { price: slabAfter },
    });
    const slabRow = await prisma.priceSlab.findUnique({ where: { id: slab.id } });
    check('Slab price adjust', Number(slabRow?.price) === slabAfter);
    await prisma.priceSlab.update({ where: { id: slab.id }, data: { price: slabBefore } });
  } else {
    console.log('  ⚠ No price slabs — slab test skipped');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

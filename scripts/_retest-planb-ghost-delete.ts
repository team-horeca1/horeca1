/**
 * Retest: import-like create → brand sync → delete → no brand/catalog ghosts.
 * Run: npx tsx scripts/_retest-planb-ghost-delete.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { findOrCreateMaster } from '../src/modules/catalog/catalog.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { syncProductToBrand, findOrCreateBrandByName } from '../src/modules/brand/brand.service';
import { ensureInventoryForAllOutlets } from '../src/lib/inventoryOutlet';

async function main() {
  const vendor = await prisma.vendor.findFirst({
    select: { id: true, businessAccountId: true, businessName: true },
  });
  if (!vendor) throw new Error('No vendor');

  const cat = await prisma.category.findFirst({
    where: { isActive: true, approvalStatus: 'approved', children: { none: {} } },
    select: { id: true, name: true },
  });
  if (!cat) throw new Error('No leaf category');

  const name = `Plan B Ghost Retest ${Date.now()}`;
  const brand = await findOrCreateBrandByName({ name: 'Plan B', autoApprove: true });
  if (!brand) throw new Error('brand');

  const masterId = await findOrCreateMaster({
    name,
    brand: 'Plan B',
    categoryId: cat.id,
  });

  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: cat.id,
      masterProductId: masterId,
      name,
      slug: `plan-b-ghost-${Date.now()}`,
      sku: `TEST-GHOST-${Date.now()}`,
      vendorSku: `GHOST-${Date.now()}`,
      brand: 'Plan B',
      basePrice: 100,
      taxPercent: 5,
      approvalStatus: 'approved',
      isActive: true,
      packSize: '250 gm',
      unit: 'Pc',
    },
  });
  await ensureInventoryForAllOutlets(product.id, vendor.id, vendor.businessAccountId, {
    initialQty: 10,
  });

  await syncProductToBrand(
    'Plan B',
    name,
    cat.id,
    null,
    '250 gm',
    'Pc',
    product.sku,
    masterId,
    product.id,
  );

  const bmpBefore = await prisma.brandMasterProduct.count({
    where: { brandId: brand.id, name },
  });
  if (bmpBefore < 1) throw new Error('expected BMP after sync');

  const catalog = new CatalogService();
  await catalog.deleteProduct(product.id, vendor.id);

  const bmpAfter = await prisma.brandMasterProduct.count({
    where: { brandId: brand.id, name },
  });
  const master = await prisma.masterProduct.findUnique({
    where: { id: masterId },
    select: { isActive: true },
  });
  const productGone = await prisma.product.findFirst({
    where: { id: product.id, slug: { not: { startsWith: '_deleted_' } } },
  });

  console.log({
    bmpBefore,
    bmpAfter,
    masterActive: master?.isActive,
    productGone: !productGone,
  });

  if (bmpAfter !== 0) throw new Error('BMP ghost remained');
  if (master?.isActive !== false) throw new Error('master should be inactive');
  if (productGone) throw new Error('product still live');

  console.log('OK — delete cleans brand + catalog ghosts');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

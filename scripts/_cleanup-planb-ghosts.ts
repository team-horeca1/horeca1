/**
 * One-shot: hide orphan Plan B master catalog rows and wipe brand-store ghosts
 * that have zero distributor mappings (leftover from rolled-back imports).
 *
 * Run: npx tsx scripts/_cleanup-planb-ghosts.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const masters = await prisma.masterProduct.findMany({
    where: {
      brand: { equals: 'Plan B', mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, sku: true, name: true },
  });

  let deactivated = 0;
  for (const m of masters) {
    const listings = await prisma.product.count({
      where: {
        masterProductId: m.id,
        slug: { not: { startsWith: '_deleted_' } },
      },
    });
    if (listings > 0) continue;
    await prisma.masterProduct.update({
      where: { id: m.id },
      data: { isActive: false },
    });
    deactivated++;
    console.log('deactivated master', m.sku, m.name);
  }

  const brands = await prisma.brand.findMany({
    where: { name: { equals: 'Plan B', mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  let deletedBmp = 0;
  for (const b of brands) {
    const bmps = await prisma.brandMasterProduct.findMany({
      where: { brandId: b.id },
      select: { id: true, sku: true, name: true, _count: { select: { mappings: true } } },
    });
    for (const bmp of bmps) {
      if (bmp._count.mappings > 0) continue;
      await prisma.brandMasterProduct.delete({ where: { id: bmp.id } });
      deletedBmp++;
      console.log('deleted orphan BMP', bmp.sku, bmp.name);
    }
  }

  console.log('DONE', { deactivated, deletedBmp });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

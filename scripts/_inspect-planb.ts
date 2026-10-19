import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const masters = await prisma.masterProduct.findMany({
    where: { name: { contains: 'Plan B Vegan', mode: 'insensitive' } },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      approvalStatus: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log('MASTERS', masters.length);
  for (const m of masters) console.log(' ', m.sku, m.approvalStatus, m.name, m.createdAt.toISOString());

  const brands = await prisma.brand.findMany({
    where: { name: { contains: 'Plan B', mode: 'insensitive' } },
    select: { id: true, name: true, approvalStatus: true, createdAt: true },
  });
  console.log('BRANDS', brands);

  for (const b of brands) {
    const bmps = await prisma.brandMasterProduct.findMany({
      where: { brandId: b.id },
      select: { id: true, sku: true, name: true, masterProductId: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    console.log('BMP for', b.name, bmps.length);
    for (const x of bmps) console.log(' ', x.sku, x.masterProductId?.slice(0, 8), x.name, x.createdAt.toISOString());
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'Plan B Vegan', mode: 'insensitive' } },
        { brand: { equals: 'Plan B', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      vendorSku: true,
      vendorId: true,
      approvalStatus: true,
      listingStatus: true,
      isActive: true,
      slug: true,
      masterProductId: true,
      createdAt: true,
      vendor: { select: { businessName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log('PRODUCTS', products.length);
  for (const p of products) {
    console.log(
      ' ',
      p.approvalStatus,
      p.listingStatus,
      p.isActive,
      p.slug.startsWith('_deleted_') ? 'TOMB' : 'LIVE',
      p.vendor?.businessName ?? 'NO-VENDOR',
      p.sku,
      p.vendorSku,
      p.name,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

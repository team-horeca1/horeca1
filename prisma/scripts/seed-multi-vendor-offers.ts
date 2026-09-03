/**
 * Seed competing vendor offers for the same Horeca1 MasterProduct.
 *
 * WHY: Default seed creates one unique master per listing (H1-SEED-NNNN), so
 * CategoryProductRails / collections always show "1 supplier". This script
 * clones priority-category SKUs onto other approved vendors under the SAME
 * masterProductId with varied prices + stock — for fair multi-vendor QA.
 *
 * Usage (local DB up, from repo root):
 *   npx tsx prisma/scripts/seed-multi-vendor-offers.ts
 *   npx tsx prisma/scripts/seed-multi-vendor-offers.ts --dry-run
 *   npx tsx prisma/scripts/seed-multi-vendor-offers.ts --vendors-per-master=3 --limit=20
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const VENDORS_PER_MASTER = Math.min(argNum('vendors-per-master', 3), 6);
const MASTER_LIMIT = argNum('limit', 24);

/** Leaf categories used by homepage StartOrder / CategoryProductRails. */
const PRIORITY_SLUGS = [
  'pulses-dal',
  'oils-ghee',
  'spices-masala',
  'grains-rice',
  'dairy-cheese-eggs',
  'milk-butter',
  'frozen-foods',
  'cleaning-hygiene',
  'cleaning-supplies',
  'grains-pulses',
  'herbs-seasonings',
] as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function main() {
  console.log(
    `\n=== Multi-vendor master offers ${DRY_RUN ? '(DRY RUN)' : ''} ===`,
  );
  console.log(`Target: ${VENDORS_PER_MASTER} vendors / master, up to ${MASTER_LIMIT} masters\n`);

  const categories = await prisma.category.findMany({
    where: { slug: { in: [...PRIORITY_SLUGS] }, isActive: true },
    select: { id: true, slug: true, name: true },
  });
  if (categories.length === 0) {
    console.error('No priority categories found. Seed categories first.');
    process.exit(1);
  }
  const categoryIds = categories.map((c) => c.id);
  console.log(`Categories: ${categories.map((c) => c.slug).join(', ')}`);

  let vendors = await prisma.vendor.findMany({
    where: { isActive: true, isVerified: true },
    select: {
      id: true,
      businessName: true,
      defaultOutletId: true,
      businessAccountId: true,
    },
    orderBy: { businessName: 'asc' },
  });

  if (vendors.length < 2) {
    vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        businessName: true,
        defaultOutletId: true,
        businessAccountId: true,
      },
      orderBy: { businessName: 'asc' },
    });
  }

  if (vendors.length < 2) {
    console.error('Need at least 2 active vendors.');
    process.exit(1);
  }

  console.log(`Vendors available: ${vendors.length}`);

  const outletByVendor = new Map<string, string>();
  for (const v of vendors) {
    let outletId = v.defaultOutletId;
    if (!outletId) {
      const outlet = await prisma.outlet.findFirst({
        where: { businessAccountId: v.businessAccountId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      outletId = outlet?.id ?? null;
    }
    if (outletId) outletByVendor.set(v.id, outletId);
  }

  const sourceProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      approvalStatus: 'approved',
      masterProductId: { not: null },
      OR: [
        { categoryId: { in: categoryIds } },
        { categoryLinks: { some: { categoryId: { in: categoryIds } } } },
      ],
      inventories: { some: { qtyAvailable: { gt: 0 } } },
    },
    include: {
      masterProduct: { select: { id: true, name: true, sku: true } },
      inventories: { select: { qtyAvailable: true }, take: 1 },
      priceSlabs: { orderBy: { minQty: 'asc' }, take: 3 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  const byMaster = new Map<string, (typeof sourceProducts)[number]>();
  for (const p of sourceProducts) {
    if (!p.masterProductId || !p.masterProduct) continue;
    if (!byMaster.has(p.masterProductId)) byMaster.set(p.masterProductId, p);
  }

  const targets = Array.from(byMaster.values()).slice(0, MASTER_LIMIT);
  console.log(`Source masters to enrich: ${targets.length}\n`);

  let created = 0;
  let skipped = 0;
  let alreadyMulti = 0;

  for (const source of targets) {
    const masterId = source.masterProductId!;
    const masterName = source.masterProduct!.name;

    const existing = await prisma.product.findMany({
      where: {
        masterProductId: masterId,
        isActive: true,
        approvalStatus: 'approved',
      },
      select: { vendorId: true },
    });
    const haveVendors = new Set(existing.map((e) => e.vendorId));

    if (haveVendors.size >= VENDORS_PER_MASTER) {
      alreadyMulti++;
      console.log(`  ✓ ${masterName} — already ${haveVendors.size} vendors`);
      continue;
    }

    const candidates = vendors.filter(
      (v) =>
        v.id !== source.vendorId &&
        !haveVendors.has(v.id) &&
        outletByVendor.has(v.id),
    );

    const need = VENDORS_PER_MASTER - haveVendors.size;
    const pick = candidates.slice(0, need);

    if (pick.length === 0) {
      skipped++;
      console.log(`  · ${masterName} — no spare vendors`);
      continue;
    }

    console.log(
      `  → ${masterName}: adding ${pick.length} vendor(s) (have ${haveVendors.size})`,
    );

    for (let i = 0; i < pick.length; i++) {
      const vendor = pick[i];
      const outletId = outletByVendor.get(vendor.id)!;
      const priceFactor = 0.92 + i * 0.05;
      const basePrice = Math.max(
        1,
        Math.round(Number(source.basePrice) * priceFactor * 100) / 100,
      );
      const stock = 80 + i * 40;
      const slugBase = slugify(`${vendor.businessName}-${masterName}`);
      const slug = `${slugBase}-mv`.slice(0, 90);
      const vendorSku = `POS-MV-${source.masterProduct!.sku.slice(-8)}-${i + 1}`.slice(
        0,
        64,
      );

      if (DRY_RUN) {
        console.log(
          `      [dry] ${vendor.businessName} @ ₹${basePrice} stock=${stock}`,
        );
        created++;
        continue;
      }

      const product = await prisma.product.upsert({
        where: { vendorId_slug: { vendorId: vendor.id, slug } },
        update: {
          masterProductId: masterId,
          categoryId: source.categoryId,
          name: source.name,
          basePrice,
          packSize: source.packSize,
          unit: source.unit,
          imageUrl: source.imageUrl,
          images: source.images,
          brand: source.brand,
          isActive: true,
          approvalStatus: 'approved',
          listingStatus: 'submitted',
          creditEligible: source.creditEligible,
          vendorSku,
        },
        create: {
          vendorId: vendor.id,
          masterProductId: masterId,
          categoryId: source.categoryId,
          name: source.name,
          slug,
          sku: null,
          vendorSku,
          brand: source.brand,
          basePrice,
          packSize: source.packSize,
          unit: source.unit,
          imageUrl: source.imageUrl,
          images: source.images,
          creditEligible: source.creditEligible,
          approvalStatus: 'approved',
          listingStatus: 'submitted',
          isActive: true,
          tags: ['multi-vendor-seed'],
        },
      });

      for (const slab of source.priceSlabs) {
        const slabPrice = Math.max(
          1,
          Math.round(Number(slab.price) * priceFactor * 100) / 100,
        );
        await prisma.priceSlab.upsert({
          where: {
            productId_minQty: { productId: product.id, minQty: slab.minQty },
          },
          update: { price: slabPrice },
          create: {
            productId: product.id,
            vendorId: vendor.id,
            minQty: slab.minQty,
            maxQty: slab.maxQty,
            price: slabPrice,
            sortOrder: slab.sortOrder,
          },
        });
      }

      await prisma.inventory.upsert({
        where: { productId_outletId: { productId: product.id, outletId } },
        update: { qtyAvailable: stock },
        create: {
          productId: product.id,
          vendorId: vendor.id,
          outletId,
          qtyAvailable: stock,
          lowStockThreshold: 10,
        },
      });

      if (source.categoryId) {
        await prisma.productCategory.upsert({
          where: {
            productId_categoryId: {
              productId: product.id,
              categoryId: source.categoryId,
            },
          },
          update: { isPrimary: true },
          create: {
            productId: product.id,
            categoryId: source.categoryId,
            isPrimary: true,
          },
        });
      }

      created++;
      console.log(`      + ${vendor.businessName} @ ₹${basePrice}`);
    }
  }

  console.log(
    `\nDone. created/updated=${created} alreadyMulti=${alreadyMulti} skipped=${skipped}`,
  );
  if (!DRY_RUN) {
    console.log(
      'Refresh homepage CategoryProductRails — cards should show 2–3 suppliers.',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

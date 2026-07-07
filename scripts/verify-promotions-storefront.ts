/**
 * Promotions + pricelist storefront connectivity verification.
 * Run: npx tsx scripts/verify-promotions-storefront.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  fetchLivePromotionsForVendors,
  buildProductPromotionMap,
  evaluateBxgyForCart,
  computeBxgyFreeUnits,
} from '../src/modules/promotion/promotion.service';
import { attachActivePromotions } from '../src/modules/promotion/promotion-catalog';
import { resolveUnitPrice } from '../src/modules/pricing/pricing.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

async function main() {
  let failed = 0;
  const assert = (ok: boolean, msg: string) => {
    if (ok) console.log(`${GREEN}✓${RESET} ${msg}`);
    else {
      console.log(`${RED}✗${RESET} ${msg}`);
      failed++;
    }
  };

  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, isVerified: true },
    select: { id: true },
  });
  assert(!!vendor, 'Found approved vendor');
  if (!vendor) {
    process.exit(1);
  }

  let product = await prisma.product.findFirst({
    where: { vendorId: { not: null } },
    select: { id: true, name: true, vendorId: true, basePrice: true, approvalStatus: true },
  });

  let createdProductId: string | null = null;

  assert(!!product, 'Found product for vendor');
  if (!product) process.exit(1);

  const promoVendorId = product.vendorId!;
  const promo = await prisma.promotion.create({
    data: {
      vendorId: promoVendorId,
      name: 'QA BXGY Verify',
      type: 'bxgy',
      isActive: true,
      buyProductId: product.id,
      getProductId: product.id,
      minQty: 1,
      getQty: 1,
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000 * 30),
    },
  });

  try {
    const live = await fetchLivePromotionsForVendors(prisma, [promoVendorId]);
    assert(live.some((p) => p.id === promo.id), 'BXGY promotion is live');

    const map = buildProductPromotionMap(live);
    assert(map.has(product.id), 'Buy product mapped to storefront promotion');

    const attached = await attachActivePromotions([
      { id: product.id, vendorId: product.vendorId, basePrice: product.basePrice },
    ]);
    assert(!!attached[0].storePromotion, 'attachActivePromotions sets storePromotion');

    const bxgy = await evaluateBxgyForCart(prisma, promoVendorId, [
      { productId: product.id, quantity: 2, unitPrice: Number(product.basePrice) },
    ]);
    assert(bxgy.length === 1 && bxgy[0].freeUnits === 2, 'BXGY cart: buy 2 → 2 free');

    assert(computeBxgyFreeUnits(2, 1, 1) === 2, 'computeBxgyFreeUnits math');

    const slabProduct = await prisma.product.findFirst({
      where: {
        vendorId: promoVendorId,
        priceSlabs: { some: { promoPrice: { not: null } } },
      },
      select: { id: true, vendorId: true },
    });
    if (slabProduct) {
      const user = await prisma.user.findFirst({ select: { id: true } });
      if (user) {
        const resolved = await resolveUnitPrice({
          productId: slabProduct.id,
          vendorId: slabProduct.vendorId,
          quantity: 1,
          customer: {
            userId: user.id,
            businessAccountId: null,
            outletId: null,
            outletPincode: null,
            outletCity: null,
            outletState: null,
            tags: [],
          },
        });
        assert(Number(resolved.unitPrice) > 0, 'Slab promoPrice resolves to a price');
      }
    } else {
      const testSlab = await prisma.priceSlab.create({
        data: {
          productId: product.id,
          vendorId: promoVendorId,
          minQty: 1,
          price: new Prisma.Decimal(100),
          promoPrice: new Prisma.Decimal(80),
          sortOrder: 99,
        },
      });
      const user = await prisma.user.findFirst({ select: { id: true } });
      if (user) {
        const resolved = await resolveUnitPrice({
          productId: product.id,
          vendorId: promoVendorId,
          quantity: 1,
          customer: {
            userId: user.id,
            businessAccountId: null,
            outletId: null,
            outletPincode: null,
            outletCity: null,
            outletState: null,
            tags: [],
          },
        });
        assert(Number(resolved.unitPrice) === 80, 'Slab promoPrice (80) used over regular (100)');
      }
      await prisma.priceSlab.delete({ where: { id: testSlab.id } });
    }

    console.log(failed === 0 ? `\n${GREEN}All promotion/pricelist checks passed${RESET}` : `\n${RED}${failed} check(s) failed${RESET}`);
    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await prisma.promotion.delete({ where: { id: promo.id } }).catch(() => {});
    if (createdProductId) {
      await prisma.product.delete({ where: { id: createdProductId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

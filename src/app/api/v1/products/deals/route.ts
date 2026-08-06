// GET /api/v1/products/deals?pincode=...&limit=8
// WHY: Homepage "Featured Deals" strip — surfaces active products where the
//      vendor set an explicit promo price (promoPrice < basePrice), kept an
//      MRP (originalPrice > basePrice), or has a live store promotion (BXGY).
// PUBLIC: No auth — promotional surface anyone can browse.

import { NextRequest, NextResponse } from 'next/server';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';
import {
  fetchLivePromotionsForVendors,
  buildProductPromotionMap,
  livePromotionWhere,
} from '@/modules/promotion/promotion.service';

export const dynamic = 'force-dynamic';

function isPriceDeal(p: {
  basePrice: unknown;
  originalPrice: unknown;
  promoPrice: unknown;
  priceSlabs?: Array<{ price: unknown; promoPrice?: unknown | null }>;
}) {
  const base = Number(p.basePrice);
  const original = p.originalPrice != null ? Number(p.originalPrice) : null;
  const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
  if (promo != null && promo < base) return true;
  if (original != null && original > base) return true;
  const slabs = p.priceSlabs ?? [];
  return slabs.some((s) => {
    const regular = Number(s.price);
    const slabPromo = s.promoPrice != null ? Number(s.promoPrice) : null;
    return slabPromo != null && slabPromo < regular;
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get('pincode')?.trim();
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 24) : 8;

    let vendorIdFilter: string[] | null = null;
    if (pincode && /^\d{6}$/.test(pincode)) {
      const areas = await prisma.serviceArea.findMany({
        where: { pincode },
        select: { vendorId: true },
      });
      vendorIdFilter = Array.from(new Set(areas.map((a) => a.vendorId)));
      if (vendorIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: { products: [] } });
      }
    }

    const promoWhere = {
      ...(vendorIdFilter ? { vendorId: { in: vendorIdFilter } } : {}),
      ...livePromotionWhere(),
      type: 'bxgy' as const,
      buyProductId: { not: null },
    };
    const liveBxgy = await prisma.promotion.findMany({
      where: promoWhere,
      select: { buyProductId: true, vendorId: true },
    });
    const promoProductIds = Array.from(
      new Set(liveBxgy.map((p) => p.buyProductId).filter((id): id is string => !!id)),
    );

    const candidates = await prisma.product.findMany({
      where: {
        isActive: true,
        approvalStatus: 'approved',
        inventories: { some: { qtyAvailable: { gt: 0 } } },
        ...(vendorIdFilter ? { vendorId: { in: vendorIdFilter } } : {}),
        OR: [
          { promoPrice: { not: null } },
          { originalPrice: { not: null } },
          ...(promoProductIds.length > 0 ? [{ id: { in: promoProductIds } }] : []),
        ],
      },
      include: {
        vendor: { select: { id: true, businessName: true, logoUrl: true, minOrderValue: true } },
        inventories: { select: { qtyAvailable: true } },
        category: { select: { id: true, name: true } },
        priceSlabs: { orderBy: { minQty: 'asc' }, take: 3 },
        brandMappings: productBrandMappingsInclude,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 4,
    });

    const vendorIds = Array.from(
      new Set(candidates.map((p) => p.vendorId).filter((id): id is string => !!id)),
    );
    const promos = await fetchLivePromotionsForVendors(prisma, vendorIds);
    const promoByProduct = buildProductPromotionMap(promos);

    const products = candidates
      .filter((p) => isPriceDeal(p) || promoByProduct.has(p.id))
      .slice(0, limit);

    let withPricing = await attachCustomerPricing(products);
    withPricing = await attachActivePromotions(withPricing);
    return NextResponse.json({ success: true, data: { products: withPricing } });
  } catch (error) {
    return errorResponse(error);
  }
}

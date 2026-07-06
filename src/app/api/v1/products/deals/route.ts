// GET /api/v1/products/deals?pincode=...&limit=8
// WHY: Homepage "Featured Deals" strip — surfaces active products where the
//      vendor set an explicit promo price (promoPrice < basePrice) or kept an
//      MRP (originalPrice > basePrice), so the discount is real.
// PUBLIC: No auth — promotional surface anyone can browse.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get('pincode')?.trim();
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 24) : 8;

    // Optional pincode gate — only include products from vendors whose ServiceArea covers this pincode.
    let vendorIdFilter: string[] | null = null;
    if (pincode && /^\d{6}$/.test(pincode)) {
      const areas = await prisma.serviceArea.findMany({
        where: { pincode },
        select: { vendorId: true },
      });
      vendorIdFilter = Array.from(new Set(areas.map(a => a.vendorId)));
      if (vendorIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: { products: [] } });
      }
    }

    // WHY the raw filter: Prisma can't express "promoPrice < basePrice" as a
    // cross-column predicate cleanly, so we broaden with promoPrice IS NOT NULL
    // plus originalPrice > basePrice, then narrow in code.
    const candidates = await prisma.product.findMany({
      where: {
        isActive: true,
        approvalStatus: 'approved',
        inventories: { some: { qtyAvailable: { gt: 0 } } },
        ...(vendorIdFilter ? { vendorId: { in: vendorIdFilter } } : {}),
        OR: [
          { promoPrice: { not: null } },
          { originalPrice: { not: null } },
        ],
      },
      include: {
        vendor: { select: { id: true, businessName: true, logoUrl: true, minOrderValue: true } },
        inventories: { select: { qtyAvailable: true } },
        category: { select: { id: true, name: true } },
        priceSlabs: { orderBy: { minQty: 'asc' }, take: 3 },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 3, // overfetch — we'll filter to real deals in code
    });

    const products = candidates
      .filter(p => {
        const base = Number(p.basePrice);
        const original = p.originalPrice != null ? Number(p.originalPrice) : null;
        const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
        return (promo != null && promo < base) || (original != null && original > base);
      })
      .slice(0, limit);

    const withPricing = await attachCustomerPricing(products);
    return NextResponse.json({ success: true, data: { products: withPricing } });
  } catch (error) {
    return errorResponse(error);
  }
}

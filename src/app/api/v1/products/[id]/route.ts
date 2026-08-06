// GET /api/v1/products/:id — Public product detail
// Returns product info with vendor details and price slabs
// PUBLIC: No auth required

import { NextRequest, NextResponse } from 'next/server';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';
import { withLegacyInventory } from '@/lib/inventoryHelpers';

export async function GET(req: NextRequest) {
  try {
    const segments = req.nextUrl.pathname.split('/');
    const productId = segments[segments.length - 1];

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        basePrice: true,
        originalPrice: true,
        promoPrice: true,
        imageUrl: true,
        images: true,
        packSize: true,
        unit: true,
        brand: true,
        tags: true,
        isActive: true,
        category: { select: { id: true, name: true, slug: true } },
        vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true, rating: true, minOrderValue: true } },
        priceSlabs: { orderBy: { minQty: 'asc' }, select: { minQty: true, maxQty: true, price: true, promoPrice: true } },
        inventories: { select: { qtyAvailable: true, qtyReserved: true } },
        brandMappings: productBrandMappingsInclude,
      },
    });

    if (!product || !product.isActive) {
      throw Errors.notFound('Product not found');
    }

    // Logged-in buyers see THEIR price (price lists / overrides) on the
    // detail page — same resolver the cart uses.
    // Brand mapping overrides apply for any verified/auto_mapped link (no
    // distributor-approval gate on discovery/PDP). Public brand store still
    // filters approved distributors in BrandService.getStoreBySlug.
    const enriched = withLegacyInventory(product);
    const priced = await attachCustomerPricing([{
      ...enriched,
      id: product.id,
      basePrice: product.basePrice,
      vendorId: product.vendorId ?? enriched.vendor?.id ?? undefined,
    }]);
    const withPromos = await attachActivePromotions(priced);
    return NextResponse.json({ success: true, data: withPromos[0] });
  } catch (error) {
    return errorResponse(error);
  }
}

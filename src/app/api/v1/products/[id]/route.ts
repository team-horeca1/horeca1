// GET /api/v1/products/:id — Public product detail
// Returns product info with vendor details and price slabs
// PUBLIC: No auth required

import { NextRequest, NextResponse } from 'next/server';
import { filterProductBrandMappings } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { withLegacyInventory } from '@/lib/inventoryHelpers';

export async function GET(req: NextRequest) {
  try {
    const segments = req.nextUrl.pathname.split('/');
    const productId = segments[segments.length - 1];

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
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
        priceSlabs: { orderBy: { minQty: 'asc' }, select: { minQty: true, maxQty: true, price: true } },
        inventories: { select: { qtyAvailable: true, qtyReserved: true } },
        brandMappings: {
          where: { status: { in: ['verified', 'auto_mapped'] } },
          select: {
            brandId: true,
            brandMasterProduct: {
              select: {
                name: true,
                brand: { select: { name: true, slug: true } },
              },
            },
          },
          orderBy: { confidenceScore: 'desc' },
          take: 1,
        },
      },
    });

    if (!product || !product.isActive) {
      throw Errors.notFound('Product not found');
    }

    // Logged-in buyers see THEIR price (price lists / overrides) on the
    // detail page — same resolver the cart uses.
    const [filtered] = await filterProductBrandMappings([withLegacyInventory(product)]);
    const [withPricing] = await attachCustomerPricing([filtered]);
    return NextResponse.json({ success: true, data: withPricing });
  } catch (error) {
    return errorResponse(error);
  }
}

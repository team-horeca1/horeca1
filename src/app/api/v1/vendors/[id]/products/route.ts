// GET /api/v1/vendors/:id/products — List products for a specific vendor
// WHY: When user opens a vendor store, they see all products from that vendor
//      Each product includes price slabs (bulk discounts) and stock availability
// PUBLIC: Anyone can browse products
// SUPPORTS: ?categoryId=xxx&search=onion&cursor=xxx&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { vendorProductsSchema } from '@/modules/catalog/catalog.validator';
import { errorResponse } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';

const catalogService = new CatalogService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorId } = await params;
    const queryParams = Object.fromEntries(req.nextUrl.searchParams);
    const options = vendorProductsSchema.parse(queryParams);

    const result = await catalogService.getVendorProducts(vendorId, options);
    // Logged-in buyers see THEIR price (price lists / overrides) on the
    // store listing — same resolver the cart uses, so no checkout surprises.
    result.products = await attachCustomerPricing(result.products);
    result.products = await attachActivePromotions(result.products);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

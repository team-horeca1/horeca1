// GET /api/v1/search?q=onion&pincode=400001 — Search products, vendors, and categories
// WHY: Powers the search overlay in the navbar — user types "paneer" and gets:
//      1. Matching products (with prices + stock)
//      2. Matching vendors
//      3. Matching categories
//      This 3-block response lets the frontend show a rich search results page
// PUBLIC: No login needed

import { NextRequest, NextResponse } from 'next/server';
import { SearchService } from '@/modules/catalog/search.service';
import { searchProductsSchema } from '@/modules/catalog/catalog.validator';
import { errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';

const searchService = new SearchService();

export async function GET(req: NextRequest) {
  try {
    // Rate limit: 30 searches per IP per minute
    const { allowed } = await checkRateLimit(`search:${getClientIp(req)}`, 30, 60000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const queryParams = Object.fromEntries(req.nextUrl.searchParams);
    const { q, pincode, cursor, limit } = searchProductsSchema.parse(queryParams);

    const result = await searchService.search(q, pincode, cursor, limit);
    // Logged-in buyers see THEIR price (price lists / overrides) in results.
    let products = await attachCustomerPricing(result.products);
    products = await attachActivePromotions(products);
    return NextResponse.json({ success: true, data: { ...result, products } });
  } catch (error) {
    return errorResponse(error);
  }
}

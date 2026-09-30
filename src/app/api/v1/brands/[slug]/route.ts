// GET /api/v1/brands/[slug] — Brand store page data
// PUBLIC: No auth required
// Returns: brand info + canonical products + distributor availability

import { NextRequest, NextResponse } from 'next/server';
import { BrandService } from '@/modules/brand/brand.service';
import { errorResponse } from '@/middleware/errorHandler';

const brandService = new BrandService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const brandService = new BrandService();
    const { slug } = await params;
    const pincode = req.nextUrl.searchParams.get('pincode')?.trim() || undefined;
    const result = await brandService.getStoreBySlug(slug, { pincode });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

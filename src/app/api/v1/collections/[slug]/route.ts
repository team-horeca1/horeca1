// GET /api/v1/collections/:slug — Collection detail with MasterProduct + vendor offers
// PUBLIC. ?pincode= filters offers to serviceable vendors.

import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { errorResponse } from '@/middleware/errorHandler';

export const dynamic = 'force-dynamic';

const catalogService = new CatalogService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const pincode = new URL(req.url).searchParams.get('pincode')?.trim();
    const collection = await catalogService.getCollectionBySlug(slug, {
      pincode: pincode || undefined,
    });
    return NextResponse.json({ success: true, data: collection });
  } catch (error) {
    return errorResponse(error);
  }
}

// GET /api/v1/vendors/:id/store-promotions — Live store-wide pct/flat offers
// PUBLIC: Shown in vendor storefront header banner

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { getVendorStoreWidePromos } from '@/modules/promotion/promotion-catalog';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: vendorId } = await params;
    const promos = await getVendorStoreWidePromos(vendorId);
    return NextResponse.json({ success: true, data: promos });
  } catch (error) {
    return errorResponse(error);
  }
}

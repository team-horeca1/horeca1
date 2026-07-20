/**
 * GET /api/v1/supplier/businesses/[id]/summary
 * Lightweight business summary (store counts) for supplier UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { listSupplierBusinesses } from '@/modules/supplier/supplier.service';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const id = req.nextUrl.pathname.split('/').at(-2);
    if (!id) throw Errors.badRequest('Business id required');
    const businesses = await listSupplierBusinesses(actorId);
    const business = businesses.find((b) => b.id === id);
    if (!business) throw Errors.notFound('Business not found');
    return NextResponse.json({
      success: true,
      data: {
        id: business.id,
        legalName: business.legalName,
        displayName: business.displayName,
        storeCount: business.storeCount,
        activeStoreCount: business.stores.filter((s) => s.isActive).length,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});

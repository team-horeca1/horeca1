// GET /api/v1/vendor/cancel-requests — List cancel requests for this store

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { cancelRequestService } from '@/modules/order/cancel-request.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const vendorId = await resolveVendorId(ctx, req);
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const data = await cancelRequestService.listVendorCancelRequests(vendorId, status);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

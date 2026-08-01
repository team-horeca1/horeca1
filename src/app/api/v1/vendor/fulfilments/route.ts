// GET /api/v1/vendor/fulfilments — List fulfilments (filters + cursor)

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';
import { listFulfilmentsQuerySchema } from '@/modules/fulfillment/fulfillment.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.view');

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = listFulfilmentsQuerySchema.parse(raw);

    const result = await fulfilmentService.list(vendorId, filters);
    return NextResponse.json({
      success: true,
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

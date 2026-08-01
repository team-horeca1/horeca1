// POST /api/v1/vendor/fulfilments/bulk — Bulk assign boy + dispatch

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';
import { fulfilmentBulkActionSchema } from '@/modules/fulfillment/fulfillment.validator';

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const body = fulfilmentBulkActionSchema.parse(await req.json());
    const data = await fulfilmentService.bulkAction(vendorId, body, ctx.userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

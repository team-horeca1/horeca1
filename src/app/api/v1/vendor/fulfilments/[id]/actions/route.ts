// POST /api/v1/vendor/fulfilments/:id/actions — Single action dispatcher

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';
import { fulfilmentActionSchema } from '@/modules/fulfillment/fulfillment.validator';

function extractFulfilmentId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../fulfilments/:id/actions
  const actionsIdx = segments.lastIndexOf('actions');
  return segments[actionsIdx - 1]!;
}

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const body = fulfilmentActionSchema.parse(await req.json());
    const data = await fulfilmentService.dispatchAction(
      vendorId,
      extractFulfilmentId(req),
      body,
      ctx.userId,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

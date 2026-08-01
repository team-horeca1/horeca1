// GET /api/v1/vendor/fulfilments/:id — Fulfilment detail (items, events, linked order)

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1]!;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.view');

    const data = await fulfilmentService.getById(vendorId, extractId(req));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

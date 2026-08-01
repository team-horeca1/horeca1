// GET/POST /api/v1/vendor/fulfilments/resources — Delivery resource roster

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';
import { createDeliveryResourceSchema } from '@/modules/fulfillment/fulfillment.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.view');

    const activeOnly = req.nextUrl.searchParams.get('all') !== '1';
    const data = await fulfilmentService.listDeliveryResources(vendorId, { activeOnly });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const body = createDeliveryResourceSchema.parse(await req.json());
    const data = await fulfilmentService.createDeliveryResource(vendorId, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/vendor/fulfilments/resources/:id/portal — ensure boy portal link

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { fulfilmentService } from '@/modules/fulfillment/fulfillment.service';

const idSchema = z.string().uuid();

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    // .../resources/:id/portal
    const id = idSchema.parse(segments[segments.length - 2]);
    const data = await fulfilmentService.ensureBoyPortalForResource(vendorId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET /api/v1/vendor/price-lists/publishes — publish history

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { listPublishes } from '@/modules/pricing/pricelist-workspace.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 30, 100);
    const data = await listPublishes(vendorId, cursor, limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

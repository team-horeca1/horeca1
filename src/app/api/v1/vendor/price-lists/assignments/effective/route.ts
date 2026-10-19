// GET /api/v1/vendor/price-lists/assignments/effective

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { listEffectiveAssignments } from '@/modules/pricing/pricelist-assignment.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const data = await listEffectiveAssignments(vendorId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

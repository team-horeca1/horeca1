/**
 * GET /api/v1/supplier/dashboard — aggregate KPIs across all Online Stores
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { getSupplierDashboard } from '@/modules/supplier/supplier.service';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'dashboard.view');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const data = await getSupplierDashboard(actorId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

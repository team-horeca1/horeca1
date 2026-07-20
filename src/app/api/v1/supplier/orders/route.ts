/**
 * GET /api/v1/supplier/orders — orders across all supplier Online Stores
 * SUPPORTS: ?status=&search=&cursor=&limit=20&dateFrom=&dateTo=&paymentStatus=
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { listSupplierOrders } from '@/modules/supplier/supplier.service';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const params = req.nextUrl.searchParams;
    const data = await listSupplierOrders(actorId, {
      status: params.get('status') || undefined,
      search: params.get('search') || undefined,
      cursor: params.get('cursor') || undefined,
      limit: Number(params.get('limit')) || 20,
      dateFrom: params.get('dateFrom') || undefined,
      dateTo: params.get('dateTo') || undefined,
      paymentStatus: params.get('paymentStatus') || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

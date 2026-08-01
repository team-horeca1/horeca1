// GET  /api/v1/vendor/returns — List returns (workspace filters + cursor)
// PATCH kept on [id]/route for legacy approve/reject

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { returnService } from '@/modules/return/return.service';
import { listReturnsQuerySchema } from '@/modules/return/return.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.view');

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = listReturnsQuerySchema.parse(raw);

    const result = await returnService.list(vendorId, filters);
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

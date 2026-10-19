// POST /api/v1/vendor/price-lists/publishes/[id]/rollback

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { rollbackPublish } from '@/modules/pricing/pricelist-workspace.service';

function extractId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  // .../publishes/[id]/rollback
  const idx = parts.indexOf('publishes');
  const id = idx >= 0 ? parts[idx + 1] : '';
  if (!id || id === 'rollback') throw Errors.badRequest('Missing publish id');
  return id;
}

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.edit');
    const publishId = extractId(req);
    const result = await rollbackPublish({
      vendorId,
      actorId: ctx.userId,
      publishId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

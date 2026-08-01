// POST /api/v1/vendor/returns/:id/actions — S9 action dispatcher

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { returnService } from '@/modules/return/return.service';
import { returnActionSchema } from '@/modules/return/return.validator';

function extractReturnId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../returns/:id/actions
  const actionsIdx = segments.lastIndexOf('actions');
  return segments[actionsIdx - 1]!;
}

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.edit');

    const body = returnActionSchema.parse(await req.json());
    const data = await returnService.dispatchAction(
      vendorId,
      extractReturnId(req),
      body,
      ctx.userId,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

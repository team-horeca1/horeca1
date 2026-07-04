import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';
import { updatePicklistStatusSchema } from '@/modules/warehouse/warehouse.validator';

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1]!;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const vendorId = await resolveVendorId(ctx, req);
    const data = await warehouseService.getPicklist(vendorId, extractId(req));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = updatePicklistStatusSchema.parse(await req.json());
    const data = await warehouseService.updatePicklistStatus(
      vendorId,
      extractId(req),
      body.status,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

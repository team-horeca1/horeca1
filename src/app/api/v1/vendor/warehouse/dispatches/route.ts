import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';
import { createDispatchSchema } from '@/modules/warehouse/warehouse.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const vendorId = await resolveVendorId(ctx, req);
    const data = await warehouseService.listDispatches(vendorId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createDispatchSchema.parse(await req.json());
    const data = await warehouseService.createDispatch(vendorId, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

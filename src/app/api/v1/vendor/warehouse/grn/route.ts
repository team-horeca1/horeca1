import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';
import { createGrnSchema } from '@/modules/warehouse/warehouse.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const voc = await resolveVendorOutletContext(ctx, req);
    const data = await warehouseService.listGrns(voc.vendorId, voc.outletId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const voc = await resolveVendorOutletContext(ctx, req);
    const body = createGrnSchema.parse(await req.json());
    const data = await warehouseService.createGrn(voc.vendorId, voc.outletId, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

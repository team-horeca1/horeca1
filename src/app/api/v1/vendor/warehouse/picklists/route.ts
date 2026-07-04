import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';
import { createPicklistSchema } from '@/modules/warehouse/warehouse.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const vendorId = await resolveVendorId(ctx, req);
    const data = await warehouseService.listPicklists(vendorId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createPicklistSchema.parse(await req.json());
    const data = await warehouseService.createPicklist(vendorId, body);
    return NextResponse.json({ success: true, data }, { status: data.reused ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const vendorId = await resolveVendorId(ctx, req);
    const params = new URL(req.url).searchParams;
    const type = params.get('type') ?? 'orders';
    const q = params.get('q')?.trim() ?? '';

    if (type === 'products') {
      const products = await warehouseService.lookupProducts(vendorId, q);
      return NextResponse.json({ success: true, data: { products } });
    }

    const orders = await warehouseService.lookupOrders(vendorId, q);
    return NextResponse.json({ success: true, data: { orders } });
  } catch (error) {
    return errorResponse(error);
  }
});

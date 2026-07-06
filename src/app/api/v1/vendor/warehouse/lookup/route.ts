import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { warehouseService } from '@/modules/warehouse/warehouse.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const voc = await resolveVendorOutletContext(ctx, req);
    const params = new URL(req.url).searchParams;
    const type = params.get('type') ?? 'orders';
    const q = params.get('q')?.trim() ?? '';

    if (type === 'products') {
      const products = await warehouseService.lookupProducts(voc.vendorId, q);
      return NextResponse.json({ success: true, data: { products } });
    }

    const orders = await warehouseService.lookupOrders(voc.vendorId, voc.outletId, q);
    return NextResponse.json({ success: true, data: { orders } });
  } catch (error) {
    return errorResponse(error);
  }
});

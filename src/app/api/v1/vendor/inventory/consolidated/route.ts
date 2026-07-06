import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { seedInventoryRowsForMultiWarehouse } from '@/lib/inventoryOutlet';
import { InventoryService } from '@/modules/inventory/inventory.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    await seedInventoryRowsForMultiWarehouse(voc.vendorId, voc.businessAccountId);
    const data = await new InventoryService().getConsolidated(voc.vendorId, voc.accessibleOutletIds);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { generateInventoryImportTemplate } from '@/modules/import-export/inventoryExcel.service';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

const skuImportItemSchema = z.object({
  sku: z.string().min(1).max(100),
  qtyAvailable: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).optional(),
  warehousePincode: z.string().max(10).optional(),
});

const skuImportSchema = z.object({
  items: z.array(skuImportItemSchema).min(1).max(500),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const template = req.nextUrl.searchParams.get('template') === 'true';
    if (!template) {
      return NextResponse.json({ success: false, error: { message: 'Use ?template=true' } }, { status: 400 });
    }

    const voc = await resolveVendorOutletContext(ctx, req);
    const buffer = generateInventoryImportTemplate({ multiWarehouse: voc.multiWarehouseEnabled });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="inventory_stock_template.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const voc = await resolveVendorOutletContext(ctx, req);
    const body = skuImportSchema.parse(await req.json());
    const inventoryService = new InventoryService();

    const result = await inventoryService.bulkUpdateStockBySku({
      vendorId: voc.vendorId,
      businessAccountId: voc.businessAccountId,
      defaultOutletId: voc.outletId,
      multiWarehouse: voc.multiWarehouseEnabled,
      items: body.items,
    });

    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.inventoryBulkUpdate,
      entity: 'inventory',
      metadata: {
        vendorId: voc.vendorId,
        mode: 'sku_import',
        matched: result.matched,
        updated: result.updated,
        skipped: result.skipped,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
});

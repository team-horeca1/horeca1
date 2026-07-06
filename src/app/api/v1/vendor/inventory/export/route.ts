import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorOutletContext, buildInventoryOutletWhere } from '@/lib/resolveVendorOutletContext';
import { ensureInventoryRowsForOutlet } from '@/lib/inventoryOutlet';
import {
  exportInventoryToCsv,
  exportInventoryToXlsx,
  type InventoryExportRow,
} from '@/modules/import-export/inventoryExcel.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const consolidated = req.nextUrl.searchParams.get('consolidated') === 'true';
    const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const outletWhere = buildInventoryOutletWhere(voc, consolidated);

    if (!consolidated) {
      await ensureInventoryRowsForOutlet(voc.vendorId, voc.outletId);
    }

    const inventory = await prisma.inventory.findMany({
      where: { vendorId: voc.vendorId, ...outletWhere },
      include: {
        product: {
          select: { id: true, name: true, sku: true, vendorSku: true, unit: true },
        },
        outlet: { select: { name: true, pincode: true } },
      },
      orderBy: [{ outlet: { name: 'asc' } }, { product: { name: 'asc' } }],
    });

    const rows: InventoryExportRow[] = inventory.map((item) => ({
      sku: item.product.vendorSku || item.product.sku || item.product.id,
      productName: item.product.name,
      qtyAvailable: item.qtyAvailable,
      qtyInTransit: item.qtyInTransit,
      qtyDamaged: item.qtyDamaged,
      qtyReturned: item.qtyReturned,
      lowStockThreshold: item.lowStockThreshold,
      warehouse: consolidated ? item.outlet.name : undefined,
      warehousePincode: consolidated ? item.outlet.pincode : undefined,
      unit: item.product.unit,
    }));

    const date = new Date().toISOString().slice(0, 10);
    const suffix = consolidated ? 'all-warehouses' : 'warehouse';

    if (format === 'csv') {
      const csv = exportInventoryToCsv(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="inventory-${suffix}-${date}.csv"`,
        },
      });
    }

    const buffer = exportInventoryToXlsx(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="inventory-${suffix}-${date}.xlsx"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET   /api/v1/vendor/inventory — List all inventory for vendor's products
// PATCH /api/v1/vendor/inventory — Update stock level or low-stock threshold
// WHY: Vendors need to monitor stock levels across all products and update
//      quantities as shipments arrive or thresholds need adjustment
// PROTECTED: Vendor only (vendors + admins)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

// Validation schema for inventory updates
const updateInventorySchema = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid().optional().nullable(),
  qtyAvailable: z.number().int().min(0).optional(),
  qtyInTransit: z.number().int().min(0).optional(),
  qtyDamaged: z.number().int().min(0).optional(),
  qtyReturned: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

const bulkUpdateSchema = z.object({
  // Legacy CSV-import shape: explicit absolute qty per product.
  items: z.array(z.object({
    productId: z.string().uuid(),
    qtyAvailable: z.number().int().min(0),
  })).min(1).max(500).optional(),
  // Bulk Update Engine shape: a mode applied to a selection of products.
  productIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  mode: z.enum(['set', 'increase', 'decrease']).optional(),
  value: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
}).refine(
  (s) => !!s.items || (!!s.productIds && (!!s.mode || s.lowStockThreshold !== undefined)),
  { message: 'Provide items[], or productIds[] with a mode and/or lowStockThreshold' },
);

// GET — list all inventory rows with product info + low-stock flag
export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const outletId = new URL(req.url).searchParams.get('outletId');
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { multiWarehouseEnabled: true },
    });

    const where: { vendorId: string; outletId?: string | null } = { vendorId };
    if (vendor?.multiWarehouseEnabled && outletId) {
      where.outletId = outletId;
    }

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true, imageUrl: true, isActive: true, basePrice: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Enrich each row with computed isLowStock flag
    const data = inventory.map((item) => ({
      ...item,
      isLowStock: item.qtyAvailable - item.qtyReserved <= item.lowStockThreshold,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update stock quantity or low-stock threshold for a single product
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'inventory.edit');

    const body = await req.json();
    const { productId, outletId, qtyAvailable, qtyInTransit, qtyDamaged, qtyReturned, lowStockThreshold } = updateInventorySchema.parse(body);

    const inventoryService = new InventoryService();
    const updated = await inventoryService.updateStock(productId, vendorId, {
      ...(qtyAvailable !== undefined && { qtyAvailable }),
      ...(qtyInTransit !== undefined && { qtyInTransit }),
      ...(qtyDamaged !== undefined && { qtyDamaged }),
      ...(qtyReturned !== undefined && { qtyReturned }),
      ...(lowStockThreshold !== undefined && { lowStockThreshold }),
    }, ctx.userId);

    if (outletId !== undefined) {
      await prisma.inventory.updateMany({
        where: { productId, vendorId },
        data: { outletId },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — bulk stock update. Two shapes:
//   1. { items: [{productId, qtyAvailable}] }              (legacy CSV import — absolute set)
//   2. { productIds, mode, value, lowStockThreshold }      (Bulk Update Engine — set/+/−)
export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'inventory.edit');

    const body = bulkUpdateSchema.parse(await req.json());
    const inventoryService = new InventoryService();

    if (body.items) {
      await inventoryService.bulkUpdateStock(vendorId, body.items);
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.inventoryBulkUpdate,
        entity: 'inventory',
        metadata: { vendorId, mode: 'set', count: body.items.length },
      });
      return NextResponse.json({ success: true, updated: body.items.length });
    }

    const result = await inventoryService.bulkAdjustStock({
      productIds: body.productIds!,
      mode: body.mode,
      value: body.value,
      lowStockThreshold: body.lowStockThreshold,
      scopeVendorId: vendorId,
    });
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.inventoryBulkUpdate,
      entity: 'inventory',
      metadata: { vendorId, mode: body.mode ?? 'threshold', updated: result.updated },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
});

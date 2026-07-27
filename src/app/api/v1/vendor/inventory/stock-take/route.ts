// POST /api/v1/vendor/inventory/stock-take — Physical count → variance → apply

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

const stockTakeSchema = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid().optional(),
  physicalCount: z.number().int().min(0),
  notes: z.string().max(180).optional(),
  /** When false, only returns variance preview without applying. Default true. */
  apply: z.boolean().optional().default(true),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const voc = await resolveVendorOutletContext(ctx, req);
    const body = stockTakeSchema.parse(await req.json());

    let targetOutletId = voc.outletId;
    if (body.outletId) {
      const belongs = await prisma.outlet.findFirst({
        where: {
          id: body.outletId,
          businessAccountId: voc.businessAccountId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!belongs) throw Errors.badRequest('Outlet not found for this vendor');
      if (ctx.accessibleOutletIds.length > 0 && !ctx.accessibleOutletIds.includes(body.outletId)) {
        throw Errors.forbidden('You do not have access to that outlet');
      }
      targetOutletId = body.outletId;
    }

    const inventoryService = new InventoryService();

    if (!body.apply) {
      const before = await inventoryService.getStock(body.productId, targetOutletId);
      if (before.vendorId !== voc.vendorId) throw Errors.notFound('Inventory');
      const systemQty = before.qtyAvailable;
      return NextResponse.json({
        success: true,
        preview: true,
        data: {
          systemQty,
          physicalCount: body.physicalCount,
          variance: body.physicalCount - systemQty,
        },
      });
    }

    const result = await inventoryService.stockTake({
      productId: body.productId,
      vendorId: voc.vendorId,
      outletId: targetOutletId,
      physicalCount: body.physicalCount,
      changedBy: ctx.userId,
      notes: body.notes,
    });

    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.inventoryBulkUpdate,
      entity: 'inventory',
      entityId: result.inventory.id,
      metadata: {
        mode: 'stock_take',
        productId: body.productId,
        systemQty: result.systemQty,
        physicalCount: result.physicalCount,
        variance: result.variance,
      },
    });

    return NextResponse.json({
      success: true,
      preview: false,
      data: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

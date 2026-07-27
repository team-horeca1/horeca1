// GET   /api/v1/vendor/inventory — List inventory for active warehouse
// PATCH /api/v1/vendor/inventory — Update stock at active warehouse
// POST  /api/v1/vendor/inventory — Bulk stock update at active warehouse

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { resolveVendorOutletContext, buildInventoryOutletWhere } from '@/lib/resolveVendorOutletContext';
import { ensureInventoryRowsForOutlet } from '@/lib/inventoryOutlet';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

const updateInventorySchema = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid().optional(),
  qtyAvailable: z.number().int().min(0).optional(),
  qtyInTransit: z.number().int().min(0).optional(),
  qtyDamaged: z.number().int().min(0).optional(),
  qtyReturned: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  reason: z.string().max(180).optional(),
});

const bulkUpdateSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    qtyAvailable: z.number().int().min(0),
  })).min(1).max(500).optional(),
  productIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  mode: z.enum(['set', 'increase', 'decrease']).optional(),
  value: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
}).refine(
  (s) => !!s.items || (!!s.productIds && (!!s.mode || s.lowStockThreshold !== undefined)),
  { message: 'Provide items[], or productIds[] with a mode and/or lowStockThreshold' },
);

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const allOutlets = req.nextUrl.searchParams.get('outletId') === 'all';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const outletWhere = buildInventoryOutletWhere(voc, allOutlets);

    if (!allOutlets) {
      await ensureInventoryRowsForOutlet(voc.vendorId, voc.outletId);
    }

    const inventory = await prisma.inventory.findMany({
      where: { vendorId: voc.vendorId, ...outletWhere },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            imageUrl: true,
            isActive: true,
            basePrice: true,
            brand: true,
            tags: true,
            category: { select: { id: true, name: true } },
          },
        },
        outlet: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = inventory.map((item) => ({
      ...item,
      isLowStock: item.qtyAvailable - item.qtyReserved <= item.lowStockThreshold,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const voc = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'inventory.edit');

    const body = await req.json();
    const {
      productId,
      outletId: bodyOutletId,
      qtyAvailable,
      qtyInTransit,
      qtyDamaged,
      qtyReturned,
      lowStockThreshold,
      reason,
    } = updateInventorySchema.parse(body);

    let targetOutletId = voc.outletId;
    if (bodyOutletId) {
      const belongsToVendor = await prisma.outlet.findFirst({
        where: {
          id: bodyOutletId,
          businessAccountId: voc.businessAccountId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!belongsToVendor) {
        throw Errors.badRequest('Outlet not found for this vendor');
      }
      if (ctx.accessibleOutletIds.length > 0 && !ctx.accessibleOutletIds.includes(bodyOutletId)) {
        throw Errors.forbidden('You do not have access to that outlet');
      }
      targetOutletId = bodyOutletId;
    }

    const inventoryService = new InventoryService();
    const logReason = reason?.trim()
      ? `manual_update: ${reason.trim()}`.slice(0, 200)
      : 'manual_update';
    const updated = await inventoryService.updateStock(
      productId,
      voc.vendorId,
      targetOutletId,
      {
        ...(qtyAvailable !== undefined && { qtyAvailable }),
        ...(qtyInTransit !== undefined && { qtyInTransit }),
        ...(qtyDamaged !== undefined && { qtyDamaged }),
        ...(qtyReturned !== undefined && { qtyReturned }),
        ...(lowStockThreshold !== undefined && { lowStockThreshold }),
      },
      ctx.userId,
      logReason,
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const voc = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'inventory.edit');

    const body = bulkUpdateSchema.parse(await req.json());
    const inventoryService = new InventoryService();

    if (body.items) {
      await inventoryService.bulkUpdateStock(voc.vendorId, voc.outletId, body.items, ctx.userId);
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.inventoryBulkUpdate,
        entity: 'inventory',
        metadata: { vendorId: voc.vendorId, outletId: voc.outletId, mode: 'set', count: body.items.length },
      });
      return NextResponse.json({ success: true, updated: body.items.length });
    }

    await ensureInventoryRowsForOutlet(voc.vendorId, voc.outletId);

    const result = await inventoryService.bulkAdjustStock({
      productIds: body.productIds!,
      outletId: voc.outletId,
      mode: body.mode,
      value: body.value,
      lowStockThreshold: body.lowStockThreshold,
      scopeVendorId: voc.vendorId,
      changedBy: ctx.userId,
    });
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.inventoryBulkUpdate,
      entity: 'inventory',
      metadata: { vendorId: voc.vendorId, outletId: voc.outletId, mode: body.mode ?? 'threshold', updated: result.updated },
    });
    return NextResponse.json({
      success: true,
      matched: body.productIds!.length,
      ...result,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

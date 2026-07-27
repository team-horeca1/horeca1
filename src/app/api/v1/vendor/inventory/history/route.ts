// GET /api/v1/vendor/inventory/history — Inventory movement log for a product/row

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';

const querySchema = z.object({
  inventoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.view');
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = querySchema.parse(params);

    if (!q.inventoryId && !q.productId) {
      throw Errors.badRequest('Provide inventoryId or productId');
    }

    if (q.inventoryId) {
      const owned = await prisma.inventory.findFirst({
        where: { id: q.inventoryId, vendorId: voc.vendorId },
        select: { id: true },
      });
      if (!owned) throw Errors.notFound('Inventory');
    }

    const inventoryService = new InventoryService();
    const logs = await inventoryService.getHistory({
      vendorId: voc.vendorId,
      inventoryId: q.inventoryId,
      productId: q.productId,
      outletId: q.outletId ?? (q.inventoryId ? undefined : voc.outletId),
      limit: q.limit ?? 50,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return errorResponse(error);
  }
});

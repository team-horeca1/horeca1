// POST /api/v1/vendor/inventory/transfer — stock transfer between warehouses

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { InventoryService } from '@/modules/inventory/inventory.service';

const transferSchema = z.object({
  fromOutletId: z.string().uuid(),
  toOutletId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1).max(100),
  notes: z.string().max(500).optional(),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'inventory.edit');
    const voc = await resolveVendorOutletContext(ctx, req);
    const body = transferSchema.parse(await req.json());
    const data = await new InventoryService().transferStock({
      vendorId: voc.vendorId,
      fromOutletId: body.fromOutletId,
      toOutletId: body.toOutletId,
      items: body.items,
      notes: body.notes,
      createdBy: ctx.userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

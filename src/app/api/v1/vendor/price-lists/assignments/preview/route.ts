// POST /api/v1/vendor/price-lists/assignments/preview — read-only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { previewAssignment } from '@/modules/pricing/pricelist-assignment.service';

const schema = z.object({
  priceListId: z.string().uuid(),
  target: z.object({
    type: z.enum(['customer', 'outlet', 'pincode', 'area', 'segment', 'brand', 'group', 'credit_status']),
    userId: z.string().uuid().nullable().optional(),
    businessAccountId: z.string().uuid().nullable().optional(),
    outletId: z.string().uuid().nullable().optional(),
    brandId: z.string().uuid().nullable().optional(),
    groupId: z.string().uuid().nullable().optional(),
    pincode: z.string().nullable().optional(),
    area: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
    brandName: z.string().nullable().optional(),
    creditStatus: z.string().nullable().optional(),
  }),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.edit');
    const body = schema.parse(await req.json());
    const data = await previewAssignment({
      vendorId,
      priceListId: body.priceListId,
      target: body.target,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

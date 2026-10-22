// POST /api/v1/vendor/price-lists/workspace/review — read-only diff + guardrails

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { reviewWorkspacePublish } from '@/modules/pricing/pricelist-workspace.service';

const schema = z.object({
  baseVersion: z.string().uuid().nullable(),
  cells: z.array(z.object({
    priceListId: z.string().uuid(),
    productId: z.string().uuid(),
    added: z.boolean().optional(),
    customPrice: z.number().nonnegative().nullable().optional(),
    isExcluded: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    validFrom: z.string().nullable().optional(),
    validTo: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    scheduledPrice: z.number().nonnegative().nullable().optional(),
    scheduledFrom: z.string().nullable().optional(),
    scheduledTo: z.string().nullable().optional(),
  })).min(1).max(2000),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.edit');
    const body = schema.parse(await req.json());
    const result = await reviewWorkspacePublish({
      vendorId,
      baseVersion: body.baseVersion,
      cells: body.cells,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

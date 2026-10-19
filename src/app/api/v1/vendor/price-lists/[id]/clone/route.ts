// POST /api/v1/vendor/price-lists/[id]/clone

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { clonePriceList } from '@/modules/pricing/pricelist-workspace.service';

const schema = z.object({
  name: z.string().min(1).max(255),
  adjustPercent: z.number().min(-100).max(100).optional(),
});

function extractId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  const idx = parts.indexOf('price-lists');
  const id = idx >= 0 ? parts[idx + 1] : '';
  if (!id || id === 'clone') throw Errors.badRequest('Missing price list id');
  return id;
}

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.create');
    const sourceId = extractId(req);
    const body = schema.parse(await req.json());
    const result = await clonePriceList({
      vendorId,
      sourceId,
      name: body.name,
      adjustPercent: body.adjustPercent,
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

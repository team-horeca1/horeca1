// PATCH /api/v1/vendor/claims/:id — approve/reject vendor claim
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

function extractId(req: NextRequest): string {
  return new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected', 'resolved']),
  notes: z.string().max(2000).optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const claim = await prisma.vendorClaim.findFirst({ where: { id, vendorId } });
    if (!claim) throw Errors.notFound('Claim');

    const updated = await prisma.vendorClaim.update({
      where: { id },
      data: {
        status: body.status,
        notes: body.notes ?? claim.notes,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

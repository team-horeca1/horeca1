// PATCH /api/v1/vendor/claims/:id — Vendors cannot self-approve; notes only while pending
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
  notes: z.string().max(2000).optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'claims.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const claim = await prisma.vendorClaim.findFirst({ where: { id, vendorId } });
    if (!claim) throw Errors.notFound('Claim');
    if (claim.status !== 'pending') {
      throw Errors.badRequest('Only pending claims can be updated. Platform reviews all disputes.');
    }

    const updated = await prisma.vendorClaim.update({
      where: { id },
      data: { notes: body.notes ?? claim.notes },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

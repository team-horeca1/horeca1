// PATCH /api/v1/admin/claims/:id — Approve/reject delivery dispute
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected', 'resolved']),
  notes: z.string().max(2000).optional(),
});

export const PATCH = adminOnly(async (req: NextRequest) => {
  try {
    const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
    const body = patchSchema.parse(await req.json());

    const claim = await prisma.vendorClaim.findUnique({ where: { id } });
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

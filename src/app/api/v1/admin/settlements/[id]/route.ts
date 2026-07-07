// PATCH /api/v1/admin/settlements/:id — mark settlement transferred / failed
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { vendorSettlementService } from '@/modules/vendor/vendorSettlement.service';

function extractId(req: NextRequest): string {
  return new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

const patchSchema = z.object({
  status: z.enum(['processing', 'settled', 'failed']),
  bankReference: z.string().max(100).optional(),
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const settlement = await prisma.vendorSettlement.findUnique({ where: { id } });
    if (!settlement) throw Errors.notFound('Settlement');

    if (body.status === 'settled') {
      await vendorSettlementService.markSettlementTransferred(
        id,
        body.bankReference ?? `TXN-${Date.now()}`,
      );
    } else {
      await prisma.vendorSettlement.update({
        where: { id },
        data: { status: body.status },
      });
    }

    const updated = await prisma.vendorSettlement.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

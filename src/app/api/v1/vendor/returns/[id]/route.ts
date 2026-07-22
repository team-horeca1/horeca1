// PATCH /api/v1/vendor/returns/:id — Vendor approves or rejects a return request
// WHY: Vendor has operational ownership of their orders — they decide the resolution.
//      Admin can override, but vendor does first review.
//      On approval with a refundAmount: if the original order was paid via credit,
//      we write a credit transaction to reduce the customer's outstanding balance.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { returnService } from '@/modules/return/return.service';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().max(1000).optional(),
  refundAmount: z.number().min(0).optional(),
  resolutionType: z.enum(['refund', 'credit_note', 'replacement']).optional().default('refund'),
  creditNoteAmount: z.number().positive().optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.edit');

    const returnId = extractId(req);
    const body = reviewSchema.parse(await req.json());

    // Verify the return belongs to one of this vendor's orders
    const returnReq = await prisma.returnRequest.findFirst({
      where: { id: returnId, order: { vendorId } },
    });
    if (!returnReq) throw Errors.notFound('Return request');

    const updated = await returnService.vendorReviewReturn(returnId, vendorId, {
      status: body.status,
      vendorNote: body.adminNote,
      refundAmount: body.refundAmount,
      resolutionType: body.resolutionType,
      creditNoteAmount: body.creditNoteAmount,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

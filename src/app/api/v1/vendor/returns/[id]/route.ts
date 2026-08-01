// GET   /api/v1/vendor/returns/:id — Return detail (items, events, inspection)
// PATCH /api/v1/vendor/returns/:id — Legacy approve/reject (kept for existing UI)

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

const reviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    adminNote: z.string().max(1000).optional(),
    refundAmount: z.number().min(0).optional(),
    resolutionType: z.enum(['refund', 'credit_note', 'replacement']).optional().default('refund'),
    creditNoteAmount: z.number().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'rejected' && (val.adminNote?.trim().length ?? 0) < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adminNote'],
        message: 'A note to the customer (at least 10 characters) is required when rejecting.',
      });
    }
  });

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.view');

    const data = await returnService.getById(vendorId, extractId(req));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.edit');

    const returnId = extractId(req);
    const body = reviewSchema.parse(await req.json());

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

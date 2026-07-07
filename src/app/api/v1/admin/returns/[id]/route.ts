// PATCH /api/v1/admin/returns/:id — Process return refund (vendor must approve first)
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction } from '@/lib/auditLog';
import { returnService } from '@/modules/return/return.service';

const updateSchema = z.object({
  status: z.enum(['approved', 'rejected', 'refunded']),
  adminNote: z.string().optional(),
  refundAmount: z.number().positive().optional(),
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const segments = req.nextUrl.pathname.split('/');
    const returnId = segments[segments.length - 1];

    const existing = await prisma.returnRequest.findUnique({
      where: { id: returnId },
    });
    if (!existing) throw Errors.notFound('Return request');

    const body = updateSchema.parse(await req.json());

    if (body.status === 'refunded') {
      const { updated, razorpayRefundId } = await returnService.adminProcessReturnRefund(returnId, {
        adminNote: body.adminNote,
        refundAmount: body.refundAmount,
        adminUserId: ctx.userId,
      });

      logAction(ctx, req, {
        action: 'return.processed',
        entity: 'ReturnRequest',
        entityId: returnId,
        before: { status: existing.status },
        after: { status: updated.status, razorpayRefundId },
      });

      return NextResponse.json({ success: true, data: { ...updated, razorpayRefundId } });
    }

    throw Errors.badRequest(
      'Admin cannot approve or reject returns — vendor must review first. Use refunded after vendor approval.',
    );
  } catch (error) {
    return errorResponse(error);
  }
});

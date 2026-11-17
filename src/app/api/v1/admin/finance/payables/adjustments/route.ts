import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import { approveAdjustment, proposeAdjustment } from '@/modules/finance/supplierPayable.service';

const propose = z.object({
  action: z.literal('propose'),
  orderId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  direction: z.enum(['credit', 'debit']),
  reason: z.string().min(8),
});

const approve = z.object({
  action: z.literal('approve'),
  sourceId: z.string().uuid(),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = await req.json();
    if (body.action === 'approve') {
      const input = approve.parse(body);
      const line = await approveAdjustment(input.sourceId, ctx.userId);
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.supplierPayableAdjust,
        entity: 'SupplierPayableEvent',
        entityId: input.sourceId,
        after: { approvalStatus: 'approved' },
      });
      return NextResponse.json({ success: true, data: line });
    }
    const input = propose.parse(body);
    const [whole, frac = ''] = input.amount.split('.');
    const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
    const created = await proposeAdjustment({
      orderId: input.orderId,
      amountPaise: paise,
      direction: input.direction,
      reason: input.reason,
      actorId: ctx.userId,
    });
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.supplierPayableAdjust,
      entity: 'SupplierPayableEvent',
      entityId: created.id,
      after: { approvalStatus: 'pending', direction: input.direction, amount: input.amount },
      metadata: { reason: input.reason },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    return errorResponse(error);
  }
});

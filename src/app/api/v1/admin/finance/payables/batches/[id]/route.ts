import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import {
  cancelFinanceDraft,
  finaliseFinanceBatch,
  markFinanceBatchSettled,
} from '@/modules/finance/supplierSettlement.service';

const schema = z.object({
  action: z.enum(['cancel', 'finalise', 'settle']),
  reason: z.string().optional(),
  utr: z.string().optional(),
});

function batchIdFrom(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = schema.parse(await req.json());
    const id = batchIdFrom(req);
    if (body.action === 'cancel') {
      const batch = await cancelFinanceDraft(id, ctx.userId, body.reason ?? '');
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.supplierSettlementCancel,
        entity: 'FinanceSettlementBatch',
        entityId: id,
        after: { status: 'cancelled' },
        metadata: { reason: body.reason },
      });
      return NextResponse.json({ success: true, data: batch });
    }
    if (body.action === 'finalise') {
      const batch = await finaliseFinanceBatch(id, ctx.userId);
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.supplierSettlementFinalise,
        entity: 'FinanceSettlementBatch',
        entityId: id,
        after: { status: 'finalised' },
      });
      return NextResponse.json({ success: true, data: batch });
    }
    const result = await markFinanceBatchSettled(id, ctx.userId, body.utr ?? '');
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.supplierSettlementSettle,
      entity: 'FinanceSettlementBatch',
      entityId: id,
      after: { status: 'settled', bankReference: body.utr, bankVerified: false, replayed: result.replayed },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

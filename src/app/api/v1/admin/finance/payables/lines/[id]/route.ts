import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import { placeHold, releaseHold } from '@/modules/finance/supplierPayable.service';

const schema = z.object({
  action: z.enum(['hold', 'release']),
  reason: z.string().optional(),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    const lineId = parts[parts.length - 1] ?? '';
    const body = schema.parse(await req.json());
    const line = body.action === 'hold'
      ? await placeHold(lineId, ctx.userId, body.reason ?? '')
      : await releaseHold(lineId, ctx.userId);
    void logAction(ctx, req, {
      action: body.action === 'hold' ? AUDIT_ACTIONS.supplierPayableHold : AUDIT_ACTIONS.supplierPayableRelease,
      entity: 'SupplierPayableLine',
      entityId: lineId,
      metadata: { reason: body.reason ?? null },
    });
    return NextResponse.json({ success: true, data: line });
  } catch (error) {
    return errorResponse(error);
  }
});

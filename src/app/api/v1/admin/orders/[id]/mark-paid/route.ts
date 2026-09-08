// POST /api/v1/admin/orders/:id/mark-paid — record an offline (bank transfer / PO / cheque) payment
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { OrderService } from '@/modules/order/order.service';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';

const bodySchema = z.object({
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

function extractOrderId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 2];
}

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const orderId = extractOrderId(req);
    const input = bodySchema.parse(await req.json().catch(() => ({})));
    const updated = await new OrderService().adminMarkPaid(orderId, ctx.userId, input);
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.orderMarkPaid,
      entity: 'Order',
      entityId: orderId,
      after: { paymentStatus: 'paid', paymentMethod: updated.paymentMethod },
      metadata: { reference: input.reference ?? null, note: input.note ?? null },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH /api/v1/orders/:id/submit — submit a saved draft PO (draft → pending). Req 7.
import { NextRequest, NextResponse } from 'next/server';
import { resolveStorefrontContext } from '@/lib/resolveStorefrontContext';
import { OrderService } from '@/modules/order/order.service';
import { submitDraftSchema } from '@/modules/order/order.validator';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

function orderId(req: NextRequest): string {
  const seg = new URL(req.url).pathname.split('/');
  return seg[seg.length - 2]; // .../orders/{id}/submit
}

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.order');
    const storefrontCtx = await resolveStorefrontContext(ctx);
    const body = await req.json().catch(() => ({}));
    const { paymentMethod, customerPoNumber } = submitDraftSchema.parse(body);
    const updated = await new OrderService().submitDraft(orderId(req), storefrontCtx, paymentMethod, customerPoNumber);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

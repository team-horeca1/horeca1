// POST /api/v1/orders/:id/pay — pay an unpaid offline order with DiSCCO or Horeca1 credit
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderService } from '@/modules/order/order.service';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const bodySchema = z.object({
  method: z.enum(['credit', 'wallet']),
});

const orderService = new OrderService();

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.pay');
    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    const orderId = segments[segments.length - 2];
    const { method } = bodySchema.parse(await req.json());
    const updated = await orderService.payExistingOrder(
      orderId,
      effectiveCustomerUserId(ctx),
      method,
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

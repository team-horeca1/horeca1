// GET /api/v1/orders/:id — Get single order details
// WHY: When user clicks an order in their order history, they see full details:
//      all items, quantities, prices, vendor info, payment status, delivery slot
// PROTECTED: Must be logged in (and can only see their own orders)

import { NextRequest, NextResponse } from 'next/server';
import { OrderService } from '@/modules/order/order.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const orderService = new OrderService();

export const GET = withAuth(async (
  req: NextRequest,
  ctx,
) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/orders/{id} → the ID is second-to-last segment
    const orderId = segments[segments.length - 1];
    const ownerUserId = effectiveCustomerUserId(ctx);
    const order = await orderService.getById(orderId, ownerUserId);
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(async (
  req: NextRequest,
  ctx,
) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const orderId = segments[segments.length - 1];

    const result = await orderService.delete(orderId, effectiveCustomerUserId(ctx));
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

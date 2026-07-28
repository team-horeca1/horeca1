// POST /api/v1/orders/:id/cancel-request — Customer requests cancellation (pending only)
// GET  /api/v1/orders/:id/cancel-request — Get existing cancel request

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { cancelRequestService } from '@/modules/order/cancel-request.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const schema = z.object({
  reason: z.string().min(10, 'Please provide more detail (at least 10 characters)').max(500),
});

function getOrderId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.length - 2];
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const data = await cancelRequestService.getCancelRequestForCustomer(
      orderId,
      effectiveCustomerUserId(ctx),
    );
    return NextResponse.json({ success: true, data: data ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const body = await req.json();
    const { reason } = schema.parse(body);
    const data = await cancelRequestService.createCancelRequest(
      orderId,
      effectiveCustomerUserId(ctx),
      reason,
    );
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/orders/:id/return — Customer requests a return (item-level)
// GET  /api/v1/orders/:id/return — Latest return request for this order
// PROTECTED: Must be logged in; only the order owner can submit.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { returnService } from '@/modules/return/return.service';
import { customerCreateReturnSchema } from '@/modules/return/return.validator';

function getOrderId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.length - 2];
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: ctx.userId },
      select: { id: true },
    });
    if (!order) throw Errors.notFound('Order');

    const returnRequest = await prisma.returnRequest.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    return NextResponse.json({ success: true, data: returnRequest ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const body = customerCreateReturnSchema.parse(await req.json());

    const returnRequest = await returnService.createForOrder(orderId, ctx.userId, body);

    return NextResponse.json({ success: true, data: returnRequest }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

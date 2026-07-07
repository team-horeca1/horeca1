// POST /api/v1/orders/:id/return — Customer requests a return/refund
// GET  /api/v1/orders/:id/return — Get existing return request for this order
// WHY: Customers need a way to request returns after delivery.
// PROTECTED: Must be logged in; only the order owner can submit.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { returnService } from '@/modules/return/return.service';

const returnSchema = z.object({
  reason: z.string().min(10, 'Please provide more detail (at least 10 characters)'),
});

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

    const returnRequest = await prisma.returnRequest.findUnique({
      where: { orderId },
    });

    return NextResponse.json({ success: true, data: returnRequest ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: ctx.userId },
      select: { id: true, status: true },
    });
    if (!order) throw Errors.notFound('Order');
    if (order.status !== 'delivered') {
      throw Errors.badRequest('Returns can only be requested for delivered orders');
    }

    const existing = await prisma.returnRequest.findUnique({ where: { orderId } });
    if (existing) throw Errors.badRequest('A return request already exists for this order');

    const body = await req.json();
    const { reason } = returnSchema.parse(body);

    const returnRequest = await prisma.returnRequest.create({
      data: {
        orderId,
        customerId: ctx.userId,
        reason,
      },
    });

    await returnService.notifyReturnSubmitted(returnRequest.id);

    return NextResponse.json({ success: true, data: returnRequest }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

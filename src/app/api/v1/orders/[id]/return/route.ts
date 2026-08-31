// POST /api/v1/orders/:id/return — Customer requests a return (item-level)
// GET  /api/v1/orders/:id/return — All returns for this order + remaining returnable qty
// PROTECTED: Must be logged in; only the order owner can submit.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  remainingReturnableByOrderItem,
  returnService,
} from '@/modules/return/return.service';
import { mapLegacyReturnStatus } from '@/modules/return/return.types';
import { customerCreateReturnSchema } from '@/modules/return/return.validator';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

function getOrderId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.length - 2];
}

/** Never expose pickup OTP secrets to the customer JSON. */
function sanitizeReturnForCustomer<T extends Record<string, unknown>>(row: T) {
  const {
    pickupOtp: _otp,
    pickupOtpExpiresAt: _exp,
    ...rest
  } = row as T & {
    pickupOtp?: string | null;
    pickupOtpExpiresAt?: Date | string | null;
  };
  void _otp;
  void _exp;
  return {
    ...rest,
    status: mapLegacyReturnStatus(String(rest.status ?? 'new')),
    hasPickupOtp: Boolean((row as { pickupOtp?: string | null }).pickupOtp),
  };
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: effectiveCustomerUserId(ctx) },
      select: {
        id: true,
        items: { select: { id: true, quantity: true, cancelledQty: true } },
      },
    });
    if (!order) throw Errors.notFound('Order');

    const [returns, remaining] = await Promise.all([
      prisma.returnRequest.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              orderItem: {
                select: {
                  id: true,
                  productName: true,
                  productSku: true,
                  quantity: true,
                  unitPrice: true,
                },
              },
            },
          },
          events: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      }),
      remainingReturnableByOrderItem(orderId, order.items),
    ]);

    const remainingByOrderItem: Record<string, number> = {};
    for (const [id, qty] of remaining) {
      remainingByOrderItem[id] = qty;
    }

    return NextResponse.json({
      success: true,
      data: {
        returns: returns.map((r) => sanitizeReturnForCustomer(r as Record<string, unknown>)),
        remainingByOrderItem,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const body = customerCreateReturnSchema.parse(await req.json());

    const returnRequest = await returnService.createForOrder(orderId, effectiveCustomerUserId(ctx), body);

    return NextResponse.json({ success: true, data: returnRequest }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/admin/orders/:id/return — Admin initiates a return
// GET  /api/v1/admin/orders/:id/return — Existing returns for this order + returnable item balance
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import {
  remainingReturnableByOrderItem,
  returnService,
} from '@/modules/return/return.service';
import { staffInitiatedReturnSchema } from '@/modules/return/return.validator';

function extractOrderId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.length - 2];
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const orderId = extractOrderId(req);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
            cancelledQty: true,
            fulfilledQty: true,
            unitPrice: true,
          },
        },
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
                  quantity: true,
                  unitPrice: true,
                },
              },
            },
          },
        },
      }),
      remainingReturnableByOrderItem(orderId, order.items),
    ]);

    const remainingByOrderItem: Record<string, number> = {};
    for (const [itemId, qty] of remaining) {
      remainingByOrderItem[itemId] = qty;
    }

    return NextResponse.json({
      success: true,
      data: {
        returns,
        remainingByOrderItem,
        items: order.items,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const orderId = extractOrderId(req);
    const body = staffInitiatedReturnSchema.parse(await req.json());

    const result = await returnService.createByStaffOrVendor(
      orderId,
      { role: 'admin', userId: ctx.userId },
      body,
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

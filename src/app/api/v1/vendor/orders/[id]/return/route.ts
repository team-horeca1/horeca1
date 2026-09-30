// POST /api/v1/vendor/orders/:id/return — Vendor initiates a return
// GET  /api/v1/vendor/orders/:id/return — Existing returns for this order + returnable item balance
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import {
  remainingReturnableByOrderItem,
  returnService,
} from '@/modules/return/return.service';
import { staffInitiatedReturnSchema } from '@/modules/return/return.validator';

function extractOrderId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.length - 2];
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const orderId = extractOrderId(req);

    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
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

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const orderId = extractOrderId(req);
    const body = staffInitiatedReturnSchema.parse(await req.json());

    const result = await returnService.createByStaffOrVendor(
      orderId,
      { role: 'vendor', userId: ctx.userId, vendorId },
      body,
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

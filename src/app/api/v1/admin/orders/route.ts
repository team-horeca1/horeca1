// GET /api/v1/admin/orders — List all orders (admin view)
// WHY: Admin order management — view all orders across all vendors and customers,
//      filter by status, vendor, customer, with full payment info
// PROTECTED: Admin only
// SUPPORTS: ?status=&vendorId=&customerId=&q=&cursor=&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { OrderStatus } from '@prisma/client';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'orders.view');
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get('status') as OrderStatus | null;
    const vendorId = params.get('vendorId') || undefined;
    const customerId = params.get('customerId') || undefined;
    const q = params.get('q')?.trim() || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }
    if (vendorId) {
      where.vendorId = vendorId;
    }
    if (customerId) {
      where.userId = customerId;
    }
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { user: { fullName: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { vendor: { businessName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        deliveryDate: true,
        createdAt: true,
        vendor: {
          select: { id: true, businessName: true },
        },
        user: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();

    const nextCursor = hasMore ? orders[orders.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: {
        orders,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

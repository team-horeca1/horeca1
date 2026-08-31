// POST /api/v1/orders/:id/review — Submit a review for a delivered order
// GET  /api/v1/orders/:id/review — Get existing review for an order
// WHY: Customers can rate a vendor after receiving their order.
//      Rating updates the vendor's aggregate rating + totalRatings count.
// PROTECTED: Customer must own the order

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

function getOrderId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  // /api/v1/orders/{id}/review → id is at index [5]
  return segments[5];
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);
    const body = await req.json();
    const { rating, comment } = reviewSchema.parse(body);

    // Verify order belongs to this user and is delivered
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, vendorId: true, status: true },
    });

    if (!order) throw Errors.notFound('Order');
    if (order.userId !== effectiveCustomerUserId(ctx)) throw Errors.forbidden('This order does not belong to you');
    if (order.status !== 'delivered') {
      throw Errors.conflict('You can only review a delivered order');
    }

    // Check for duplicate review
    const existing = await prisma.review.findUnique({ where: { orderId } });
    if (existing) throw Errors.conflict('You have already reviewed this order');

    // Create review
    const review = await prisma.review.create({
      data: {
        orderId,
        userId: effectiveCustomerUserId(ctx),
        vendorId: order.vendorId,
        rating,
        comment,
      },
    });

    // Recalculate vendor aggregate rating
    const agg = await prisma.review.aggregate({
      where: { vendorId: order.vendorId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.vendor.update({
      where: { id: order.vendorId },
      data: {
        rating: agg._avg.rating ?? 0,
      },
    });

    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orderId = getOrderId(req);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order) throw Errors.notFound('Order');
    if (order.userId !== effectiveCustomerUserId(ctx)) throw Errors.forbidden('This order does not belong to you');

    const review = await prisma.review.findUnique({ where: { orderId } });
    return NextResponse.json({ success: true, data: review ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

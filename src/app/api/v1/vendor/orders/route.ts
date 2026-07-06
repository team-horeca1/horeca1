// GET /api/v1/vendor/orders — List vendor's orders
// WHY: Vendor order management — view all orders placed with this vendor,
//      filter by status, search by order number, with cursor pagination
// PROTECTED: Vendor only (vendors + admins)
// SUPPORTS: ?status=&search=&cursor=&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext, buildFulfillmentOutletWhere } from '@/lib/resolveVendorOutletContext';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const allOutlets = req.nextUrl.searchParams.get('outletId') === 'all';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const vendorId = voc.vendorId;
    const orderScope = buildFulfillmentOutletWhere(voc, allOutlets);

    // Parse query params
    const params = req.nextUrl.searchParams;
    const status = params.get('status') || undefined;
    const search = params.get('search') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 50);
    const dateFrom = params.get('dateFrom') || undefined;
    const dateTo = params.get('dateTo') || undefined;
    const paymentStatus = params.get('paymentStatus') || undefined;

    // Build createdAt filter — merge dateFrom + dateTo into one object
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
    if (dateTo) createdAtFilter.lte = new Date(dateTo + 'T23:59:59Z');
    const hasDateFilter = dateFrom || dateTo;

    // Build where clause — customer drafts are private until submitted
    const where: Record<string, unknown> = {
      vendorId,
      ...orderScope,
      ...(status && status !== 'draft' ? { status } : { status: { not: 'draft' } }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { user: { fullName: { contains: search, mode: 'insensitive' } } },
          { user: { phone: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(hasDateFilter && { createdAt: createdAtFilter }),
      ...(paymentStatus && { paymentStatus }),
    };

    const orders = await prisma.order.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        paymentStatus: true,
        createdAt: true,
        outlet: { select: { name: true } },
        deliveryAddressSnapshot: true,
        fulfillmentOutletId: true,
        fulfillmentOutlet: { select: { id: true, name: true } },
        user: {
          select: { fullName: true, email: true, businessName: true },
        },
        _count: { select: { items: true } },
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

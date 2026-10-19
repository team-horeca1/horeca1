// GET /api/v1/vendor/orders — List vendor's orders
// WHY: Vendor order management — view all orders placed with this vendor,
//      filter by status, search by order number, with cursor pagination
// PROTECTED: Vendor only (vendors + admins)
// SUPPORTS: ?status=&search=&cursor=&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext, buildFulfillmentOutletWhere } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import {
  buildCreatedAtFilter,
  buildOrderStatusWhere,
  buildPaymentMethodWhere,
} from '@/lib/orderStatusFilter';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'orders.view');
  try {
    const allOutlets = req.nextUrl.searchParams.get('outletId') === 'all';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const vendorId = voc.vendorId;
    const orderScope = buildFulfillmentOutletWhere(voc, allOutlets);

    // Parse query params — brief filter aliases (Section 7) map to DB fields.
    const params = req.nextUrl.searchParams;
    const statusParam = params.get('status') || undefined;
    const search = params.get('search') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 50);
    const dateFrom = params.get('dateFrom') || undefined;
    const dateTo = params.get('dateTo') || undefined;
    const paymentStatus = params.get('paymentStatus') || undefined;
    const paymentMethod = params.get('paymentMethod') || undefined;

    let statusWhere = buildOrderStatusWhere(statusParam);
    const createdAtFilter = buildCreatedAtFilter(dateFrom, dateTo);
    if (createdAtFilter) {
      statusWhere = { ...statusWhere, createdAt: createdAtFilter };
    }

    // Build where clause — customer drafts are private until submitted
    const where: Record<string, unknown> = {
      vendorId,
      ...orderScope,
      ...statusWhere,
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { user: { fullName: { contains: search, mode: 'insensitive' } } },
          { user: { phone: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(paymentStatus && { paymentStatus }),
      ...buildPaymentMethodWhere(paymentMethod),
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
        abandonedAt: true,
        isPartial: true,
        totalAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
        acceptedAt: true,
        outlet: { select: { name: true } },
        deliveryAddressSnapshot: true,
        fulfillmentOutletId: true,
        fulfillmentOutlet: { select: { id: true, name: true } },
        user: {
          select: { fullName: true, email: true, businessName: true },
        },
        items: { select: { productId: true, quantity: true } },
        cancelRequest: { select: { status: true } },
        _count: { select: { items: true } },
      },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();

    const nextCursor = hasMore ? orders[orders.length - 1].id : null;

    // Attention flags (derived) — batch inventory for low_stock
    const { computeAttentionReasons } = await import('@/lib/orderAttention');
    const allProductIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
    const inventories = allProductIds.length
      ? await prisma.inventory.findMany({
          where: { productId: { in: allProductIds }, vendorId },
          select: { productId: true, qtyAvailable: true, qtyReserved: true },
        })
      : [];
    const invByProduct = new Map(
      inventories.map((i) => [i.productId, i.qtyAvailable - i.qtyReserved] as const),
    );

    const ordersWithAttention = orders.map((o) => {
      const hasLowStock = o.items.some((item) => {
        const avail = invByProduct.get(item.productId);
        return avail !== undefined && avail < item.quantity;
      });
      const attentionReasons = computeAttentionReasons({
        status: o.status,
        paymentStatus: o.paymentStatus,
        abandonedAt: o.abandonedAt,
        isPartial: o.isPartial,
        createdAt: o.createdAt,
        hasPendingCancelRequest: o.cancelRequest?.status === 'pending',
        hasLowStock,
      });
      const { items: _items, cancelRequest: _cr, ...rest } = o;
      return { ...rest, attentionReasons };
    });

    return NextResponse.json({
      success: true,
      data: {
        orders: ordersWithAttention,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

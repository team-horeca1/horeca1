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
import { requirePermission } from '@/lib/permissions/engine';

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

    // Build createdAt filter — merge dateFrom + dateTo into one object
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
    if (dateTo) createdAtFilter.lte = new Date(dateTo + 'T23:59:59Z');

    // Brief filter → Prisma where fragment
    const NEW_WINDOW_MS = 2 * 60 * 60 * 1000;
    let statusWhere: Record<string, unknown> = { status: { not: 'draft' } };
    if (statusParam && statusParam !== 'all' && statusParam !== 'draft') {
      switch (statusParam) {
        case 'new':
          statusWhere = {
            status: 'pending',
            createdAt: { gte: new Date(Date.now() - NEW_WINDOW_MS) },
          };
          break;
        case 'pending':
          statusWhere = { status: 'pending' };
          break;
        case 'accepted':
          statusWhere = { status: 'confirmed' };
          break;
        case 'partially_accepted':
          statusWhere = { isPartial: true, status: { not: 'draft' } };
          break;
        case 'packed':
          statusWhere = { status: 'processing' };
          break;
        case 'dispatched':
          statusWhere = { status: 'shipped' };
          break;
        case 'completed':
          statusWhere = { status: 'delivered' };
          break;
        default:
          // Native enum values: confirmed, processing, ready_for_dispatch, shipped, …
          statusWhere = { status: statusParam };
          break;
      }
    }

    if (dateFrom || dateTo) {
      const existingCreated = (statusWhere.createdAt as { gte?: Date; lte?: Date } | undefined) ?? {};
      statusWhere = {
        ...statusWhere,
        createdAt: {
          ...existingCreated,
          ...createdAtFilter,
          ...(existingCreated.gte && createdAtFilter.gte
            ? { gte: existingCreated.gte > createdAtFilter.gte ? existingCreated.gte : createdAtFilter.gte }
            : {}),
          ...(existingCreated.lte && createdAtFilter.lte
            ? { lte: existingCreated.lte < createdAtFilter.lte ? existingCreated.lte : createdAtFilter.lte }
            : {}),
        },
      };
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
      ...(paymentMethod === 'credit'
        ? { paymentMethod: { in: ['credit', 'vendor_credit', 'discco'] } }
        : paymentMethod === 'cash' || paymentMethod === 'cod'
          ? { paymentMethod: { in: ['cod', 'cash'] } }
          : paymentMethod
            ? { paymentMethod }
            : {}),
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

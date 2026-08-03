// GET /api/v1/vendor/orders/export — Full CSV of filtered orders (not page-only)

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext, buildFulfillmentOutletWhere } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'orders.view');
  try {
    const allOutlets = req.nextUrl.searchParams.get('outletId') === 'all';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const vendorId = voc.vendorId;
    const orderScope = buildFulfillmentOutletWhere(voc, allOutlets);

    const params = req.nextUrl.searchParams;
    const statusParam = params.get('status') || undefined;
    const search = params.get('search') || undefined;
    const dateFrom = params.get('dateFrom') || undefined;
    const dateTo = params.get('dateTo') || undefined;
    const paymentStatus = params.get('paymentStatus') || undefined;
    const paymentMethod = params.get('paymentMethod') || undefined;

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
    if (dateTo) createdAtFilter.lte = new Date(dateTo + 'T23:59:59Z');

    let statusWhere: Record<string, unknown> = { status: { not: 'draft' } };
    if (statusParam && statusParam !== 'all' && statusParam !== 'draft') {
      switch (statusParam) {
        case 'new':
          statusWhere = { status: 'confirmed' };
          break;
        case 'processing':
          statusWhere = {
            status: { in: ['processing', 'ready_for_dispatch', 'shipped', 'partially_delivered'] },
          };
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
          statusWhere = { status: statusParam };
          break;
      }
    }

    if (dateFrom || dateTo) {
      statusWhere = { ...statusWhere, createdAt: { ...(statusWhere.createdAt as object || {}), ...createdAtFilter } };
    }

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
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        orderNumber: true,
        status: true,
        isPartial: true,
        totalAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
        user: { select: { fullName: true, businessName: true, phone: true, email: true } },
        _count: { select: { items: true } },
      },
    });

    const header = [
      'Order / Invoice Number',
      'Customer',
      'Business',
      'Phone',
      'Email',
      'Items',
      'Amount',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Partial',
      'Date',
    ];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.user.fullName,
      o.user.businessName ?? '',
      o.user.phone ?? '',
      o.user.email ?? '',
      o._count.items,
      Number(o.totalAmount).toFixed(2),
      o.paymentMethod ?? '',
      o.paymentStatus,
      o.status,
      o.isPartial ? 'yes' : 'no',
      o.createdAt.toISOString(),
    ]);

    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

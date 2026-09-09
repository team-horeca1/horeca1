// GET /api/v1/vendor/customers/user/:userId — marketplace customer + this vendor's mapping and orders
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { marketplaceCustomerFilter } from '@/lib/marketplaceCustomers';
import { DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES } from '@/lib/vendorPaymentModes';

const userIdSchema = z.string().uuid();

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  totalAmount: true,
  createdAt: true,
} as const;

function extractUserId(req: NextRequest): string {
  return new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

async function loadVendorOrders(vendorId: string, userId: string) {
  const where = { vendorId, userId, customerDeleted: false };
  try {
    return await prisma.order.findMany({
      where,
      select: { ...ORDER_SELECT, customerPoNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  } catch {
    // Stale PrismaClient (dev server started before `prisma generate`) has no
    // customerPoNumber in its DMMF — still return the rest of the order rows.
    return await prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const parsedId = userIdSchema.safeParse(extractUserId(req));
    if (!parsedId.success) throw Errors.badRequest('Invalid customer id');
    const userId = parsedId.data;

    const user = await prisma.user.findFirst({
      where: { id: userId, AND: [marketplaceCustomerFilter()] },
      select: {
        id: true,
        fullName: true,
        businessName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });
    if (!user) throw Errors.notFound('Customer');

    const [mapping, orders, stats] = await Promise.all([
      prisma.vendorCustomer.findUnique({
        where: { vendorId_userId: { vendorId, userId } },
        include: {
          priceList: { select: { id: true, name: true, discountPercent: true } },
          salesperson: { select: { id: true, name: true, code: true } },
        },
      }),
      loadVendorOrders(vendorId, userId),
      prisma.order.aggregate({
        where: { vendorId, userId, status: { not: 'cancelled' } },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        user,
        mapping: mapping
          ? {
              ...mapping,
              mappingId: mapping.id,
              allowedPaymentModes: mapping.allowedPaymentModes?.length
                ? mapping.allowedPaymentModes
                : [...DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES],
            }
          : null,
        orders: orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          totalAmount: Number(o.totalAmount),
          customerPoNumber: 'customerPoNumber' in o ? (o.customerPoNumber ?? null) : null,
          createdAt: o.createdAt,
        })),
        orderCount: stats._count.id,
        totalSpend: Number(stats._sum.totalAmount ?? 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

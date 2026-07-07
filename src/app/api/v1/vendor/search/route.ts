// GET /api/v1/vendor/search?q= — unified dashboard search
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const vendorId = await resolveVendorId(ctx, req);
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: { products: [], orders: [], customers: [] } });
    }

    const [products, orders, customers] = await Promise.all([
      prisma.product.findMany({
        where: {
          vendorId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, name: true, sku: true, basePrice: true },
      }),
      prisma.order.findMany({
        where: {
          vendorId,
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 8,
        select: { id: true, orderNumber: true, status: true, totalAmount: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendorCustomer.findMany({
        where: {
          vendorId,
          user: {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        take: 8,
        include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        products,
        orders,
        customers: customers.map((c) => ({
          id: c.user.id,
          name: c.user.fullName,
          email: c.user.email,
          phone: c.user.phone,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

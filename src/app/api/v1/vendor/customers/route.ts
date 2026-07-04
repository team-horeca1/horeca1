// GET   /api/v1/vendor/customers — List vendor's CRM customers (mapped + order history)
// POST  /api/v1/vendor/customers — Create/update customer mapping
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

const upsertSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['active', 'blocked', 'suspended']).optional(),
  priceListId: z.string().uuid().nullable().optional(),
  territory: z.string().max(100).nullable().optional(),
  salesExecutive: z.string().max(100).optional().nullable(),
  deliveryRoute: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  paymentTerms: z.string().max(50).nullable().optional(),
  allowedPaymentModes: z.array(z.enum(['cod', 'prepaid', 'credit', 'cheque', 'discco', 'online'])).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    // Customer list returns PII (name, business name, email, phone) plus
    // spend totals — gate so storefront-only buyers and Viewers can't pull it.
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim() ?? '';
    const status = url.searchParams.get('status');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
    const take = 50;

    const customers = await prisma.vendorCustomer.findMany({
      where: {
        vendorId,
        ...(status ? { status: status as 'active' | 'blocked' | 'suspended' } : {}),
        ...(search
          ? {
              user: {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { businessName: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
        priceList: { select: { id: true, name: true, discountPercent: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * take,
      take: take + 1,
    });

    const hasMore = customers.length > take;
    const items = customers.slice(0, take);

    // Attach order summary per customer
    const userIds = items.map((c) => c.userId);
    const orderStats = await prisma.order.groupBy({
      by: ['userId'],
      where: { vendorId, userId: { in: userIds }, status: { not: 'cancelled' } },
      _count: { id: true },
      _sum: { totalAmount: true },
      _max: { createdAt: true },
    });
    const statsMap = new Map(orderStats.map((s) => [s.userId, s]));

    const enriched = items.map((c) => {
      const stats = statsMap.get(c.userId);
      return {
        ...c,
        orderCount: stats?._count.id ?? 0,
        totalSpend: Number(stats?._sum.totalAmount ?? 0),
        lastOrderAt: stats?._max.createdAt ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { customers: enriched, hasMore } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = upsertSchema.parse(await req.json());

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, fullName: true },
    });
    if (!user) throw Errors.notFound('User');

    const customer = await prisma.vendorCustomer.upsert({
      where: { vendorId_userId: { vendorId, userId: body.userId } },
      create: {
        vendorId,
        userId: body.userId,
        status: body.status ?? 'active',
        priceListId: body.priceListId ?? null,
        territory: body.territory ?? null,
        salesExecutive: body.salesExecutive ?? null,
        deliveryRoute: body.deliveryRoute ?? null,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
        paymentTerms: body.paymentTerms ?? null,
        allowedPaymentModes: body.allowedPaymentModes ?? ['cod', 'prepaid', 'credit', 'cheque'],
      },
      update: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.priceListId !== undefined && { priceListId: body.priceListId }),
        ...(body.territory !== undefined && { territory: body.territory }),
        ...(body.salesExecutive !== undefined && { salesExecutive: body.salesExecutive }),
        ...(body.deliveryRoute !== undefined && { deliveryRoute: body.deliveryRoute }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.paymentTerms !== undefined && { paymentTerms: body.paymentTerms }),
        ...(body.allowedPaymentModes !== undefined && { allowedPaymentModes: body.allowedPaymentModes }),
      },
      include: {
        user: { select: { id: true, fullName: true, businessName: true, email: true } },
        priceList: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    return errorResponse(error);
  }
});

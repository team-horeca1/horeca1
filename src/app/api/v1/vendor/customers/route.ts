// GET   /api/v1/vendor/customers — All Horeca marketplace customers + this vendor's mapping overlay
// POST  /api/v1/vendor/customers — Create/update customer mapping
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { marketplaceCustomerFilter } from '@/lib/marketplaceCustomers';
import {
  DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES,
  VENDOR_CUSTOMER_PAYMENT_MODES,
} from '@/lib/vendorPaymentModes';

const upsertSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['active', 'blocked', 'suspended']).optional(),
  priceListId: z.string().uuid().nullable().optional(),
  territory: z.string().max(100).nullable().optional(),
  salesExecutive: z.string().max(100).optional().nullable(),
  salespersonId: z.string().uuid().nullable().optional(),
  deliveryRoute: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  paymentTerms: z.string().max(50).nullable().optional(),
  allowedPaymentModes: z.array(z.enum(VENDOR_CUSTOMER_PAYMENT_MODES)).optional(),
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

    const andConditions: Prisma.UserWhereInput[] = [marketplaceCustomerFilter()];
    if (search) {
      andConditions.push({
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      });
    }
    if (status === 'active' || status === 'blocked' || status === 'suspended') {
      andConditions.push({
        vendorCustomers: { some: { vendorId, status } },
      });
    }

    const [users, totalCount, mappedCount, bankTransferCount, poNumberCount] = await Promise.all([
      prisma.user.findMany({
        where: { AND: andConditions },
        select: {
          id: true,
          fullName: true,
          businessName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take: take + 1,
      }),
      prisma.user.count({ where: { AND: andConditions } }),
      prisma.vendorCustomer.count({ where: { vendorId } }),
      prisma.vendorCustomer.count({
        where: { vendorId, allowedPaymentModes: { has: 'bank_transfer' } },
      }),
      prisma.vendorCustomer.count({
        where: { vendorId, allowedPaymentModes: { has: 'po_number' } },
      }),
    ]);

    const hasMore = users.length > take;
    const items = users.slice(0, take);
    const userIds = items.map((u) => u.id);

    const [mappings, orderStats] = await Promise.all([
      userIds.length
        ? prisma.vendorCustomer.findMany({
            where: { vendorId, userId: { in: userIds } },
            include: {
              priceList: { select: { id: true, name: true, discountPercent: true } },
              salesperson: { select: { id: true, name: true, code: true } },
            },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.order.groupBy({
            by: ['userId'],
            where: { vendorId, userId: { in: userIds }, status: { not: 'cancelled' } },
            _count: { id: true },
            _sum: { totalAmount: true },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),
    ]);
    const mappingByUser = new Map(mappings.map((m) => [m.userId, m]));
    const statsMap = new Map(orderStats.map((s) => [s.userId, s]));

    const enriched = items.map((user) => {
      const mapping = mappingByUser.get(user.id);
      const stats = statsMap.get(user.id);
      return {
        id: mapping?.id ?? user.id,
        mappingId: mapping?.id ?? null,
        userId: user.id,
        status: mapping?.status ?? null,
        priceListId: mapping?.priceListId ?? null,
        territory: mapping?.territory ?? null,
        salesExecutive: mapping?.salesExecutive ?? null,
        salespersonId: mapping?.salespersonId ?? null,
        salesperson: mapping?.salesperson ?? null,
        deliveryRoute: mapping?.deliveryRoute ?? null,
        tags: mapping?.tags ?? [],
        notes: mapping?.notes ?? null,
        paymentTerms: mapping?.paymentTerms ?? null,
        allowedPaymentModes: mapping?.allowedPaymentModes ?? [...DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES],
        createdAt: mapping?.createdAt ?? user.createdAt,
        user,
        priceList: mapping?.priceList ?? null,
        orderCount: stats?._count.id ?? 0,
        totalSpend: Number(stats?._sum.totalAmount ?? 0),
        lastOrderAt: stats?._max.createdAt ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        customers: enriched,
        hasMore,
        totals: {
          total: totalCount,
          mapped: mappedCount,
          bankTransfer: bankTransferCount,
          poNumber: poNumberCount,
        },
      },
    });
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
        salespersonId: body.salespersonId ?? null,
        deliveryRoute: body.deliveryRoute ?? null,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
        paymentTerms: body.paymentTerms ?? null,
        allowedPaymentModes: body.allowedPaymentModes ?? [...DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES],
      },
      update: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.priceListId !== undefined && { priceListId: body.priceListId }),
        ...(body.territory !== undefined && { territory: body.territory }),
        ...(body.salesExecutive !== undefined && { salesExecutive: body.salesExecutive }),
        ...(body.salespersonId !== undefined && { salespersonId: body.salespersonId }),
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

// GET /api/v1/vendor/price-history
// Filters: productId | priceListId | customerId (VendorCustomer.id)
// WHY: Section 4 flow 22–23 — product + customer-centric price history.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

const querySchema = z.object({
  productId: z.string().uuid().optional(),
  priceListId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.view');

    const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!q.productId && !q.priceListId && !q.customerId) {
      throw Errors.badRequest('Provide productId, priceListId, or customerId');
    }

    let priceListId = q.priceListId;
    let customerLabel: string | null = null;

    if (q.customerId) {
      const customer = await prisma.vendorCustomer.findFirst({
        where: { id: q.customerId, vendorId },
        select: {
          id: true,
          priceListId: true,
          priceList: { select: { id: true, name: true } },
          user: { select: { fullName: true, businessName: true } },
        },
      });
      if (!customer) throw Errors.notFound('Customer');
      customerLabel = customer.user.businessName ?? customer.user.fullName;
      priceListId = customer.priceListId ?? undefined;
      if (!priceListId) {
        return NextResponse.json({
          success: true,
          data: {
            customerId: customer.id,
            customerName: customerLabel,
            priceListId: null,
            priceListName: null,
            entries: [],
            message: 'Customer has no assigned pricelist — only default store prices apply.',
          },
        });
      }
    }

    if (priceListId) {
      const list = await prisma.priceList.findFirst({
        where: { id: priceListId, vendorId },
        select: { id: true, name: true },
      });
      if (!list) throw Errors.notFound('Price list');
    }

    if (q.productId) {
      const product = await prisma.product.findFirst({
        where: { id: q.productId, vendorId },
        select: { id: true },
      });
      if (!product) throw Errors.notFound('Product');
    }

    const logs = await prisma.priceHistory.findMany({
      where: {
        vendorId,
        ...(q.productId ? { productId: q.productId } : {}),
        ...(priceListId ? { priceListId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 100,
      select: {
        id: true,
        field: true,
        oldValue: true,
        newValue: true,
        source: true,
        reason: true,
        productId: true,
        priceListId: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        priceList: { select: { id: true, name: true } },
        actor: { select: { fullName: true, email: true } },
      },
    });

    const priceListName = logs[0]?.priceList?.name
      ?? (priceListId
        ? (await prisma.priceList.findFirst({ where: { id: priceListId }, select: { name: true } }))?.name
        : null);

    return NextResponse.json({
      success: true,
      data: {
        customerId: q.customerId ?? null,
        customerName: customerLabel,
        priceListId: priceListId ?? null,
        priceListName: priceListName ?? null,
        entries: logs.map((l) => ({
          id: l.id,
          field: l.field,
          oldValue: l.oldValue,
          newValue: l.newValue,
          source: l.source,
          reason: l.reason,
          productId: l.productId,
          productName: l.product.name,
          productSku: l.product.sku,
          priceListId: l.priceListId,
          priceListName: l.priceList?.name ?? null,
          changedAt: l.createdAt,
          actorName: l.actor?.fullName ?? l.actor?.email ?? null,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

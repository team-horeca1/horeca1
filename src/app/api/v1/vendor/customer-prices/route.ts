// GET  /api/v1/vendor/customer-prices?customerId=UUID — list custom prices for customer
// POST /api/v1/vendor/customer-prices — upsert a custom price
// DELETE /api/v1/vendor/customer-prices?customerId=UUID&productId=UUID — remove

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

const upsertSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  price: z.number().positive(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const customerId = req.nextUrl.searchParams.get('customerId');
    if (!customerId) throw Errors.badRequest('customerId required');

    const prices = await prisma.vendorCustomerPrice.findMany({
      where: { vendorId, customerId },
      include: {
        product: {
          select: { id: true, name: true, basePrice: true, unit: true, packSize: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: prices });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = upsertSchema.parse(await req.json());

    // Verify product belongs to this vendor
    const product = await prisma.product.findFirst({
      where: { id: body.productId, vendorId },
      select: { id: true },
    });
    if (!product) throw Errors.notFound('Product');

    const record = await prisma.vendorCustomerPrice.upsert({
      where: {
        vendorId_customerId_productId: {
          vendorId,
          customerId: body.customerId,
          productId: body.productId,
        },
      },
      create: { vendorId, customerId: body.customerId, productId: body.productId, price: body.price },
      update: { price: body.price },
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const customerId = req.nextUrl.searchParams.get('customerId');
    const productId = req.nextUrl.searchParams.get('productId');
    if (!customerId || !productId) throw Errors.badRequest('customerId and productId required');

    await prisma.vendorCustomerPrice.deleteMany({
      where: { vendorId, customerId, productId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

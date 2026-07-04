// GET/POST /api/v1/vendor/claims — vendor delivery shortage/damage claims
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

const createSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(['shortage', 'damage', 'quality', 'expiry']),
  amount: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const vendorId = await resolveVendorId(ctx, req);
    const claims = await prisma.vendorClaim.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        order: { select: { orderNumber: true, status: true, totalAmount: true } },
      },
    });
    return NextResponse.json({ success: true, data: claims });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createSchema.parse(await req.json());

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, vendorId },
      select: { id: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const claim = await prisma.vendorClaim.create({
      data: {
        vendorId,
        orderId: body.orderId,
        type: body.type,
        amount: body.amount,
        notes: body.notes,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

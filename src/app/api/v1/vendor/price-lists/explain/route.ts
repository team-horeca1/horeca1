// GET /api/v1/vendor/price-lists/explain?customerId=&productId=

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { explainPrice } from '@/modules/pricing/pricing.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const customerId = req.nextUrl.searchParams.get('customerId');
    const productId = req.nextUrl.searchParams.get('productId');
    if (!customerId || !productId) {
      throw Errors.badRequest('customerId and productId are required');
    }

    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        userRoles: { select: { businessAccountId: true }, take: 1 },
      },
    });
    if (!user) throw Errors.notFound('Customer');

    const baId = user.userRoles[0]?.businessAccountId ?? null;
    const outlet = baId
      ? await prisma.outlet.findFirst({
          where: { businessAccountId: baId, isActive: true },
          select: { id: true, pincode: true, city: true, state: true },
        })
      : null;

    const data = await explainPrice({
      productId,
      vendorId,
      quantity: 1,
      customer: {
        userId: customerId,
        businessAccountId: baId,
        outletId: outlet?.id ?? null,
        outletPincode: outlet?.pincode ?? null,
        outletCity: outlet?.city ?? null,
        outletState: outlet?.state ?? null,
        tags: [],
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

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
        userRoles: { select: { businessAccountId: true } },
        accountMemberships: { select: { businessAccountId: true } },
      },
    });
    if (!user) throw Errors.notFound('Customer');

    // Business accounts can be linked via UserRole OR BusinessAccountMember —
    // checking only userRoles left outlet geo empty for membership-linked
    // customers, so pincode/area rules could never match in this preview
    // even though they apply at catalog/cart time.
    const baIds = [...new Set([
      ...user.userRoles.map((r) => r.businessAccountId),
      ...user.accountMemberships.map((m) => m.businessAccountId),
    ])];
    const baId = baIds[0] ?? null;
    const outlet = baIds.length
      ? await prisma.outlet.findFirst({
          where: { businessAccountId: { in: baIds }, isActive: true },
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

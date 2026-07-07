// GET /api/v1/vendor/returns — List return requests for orders belonging to this vendor
// WHY: Vendors need visibility into what customers are requesting to return so they
//      can decide whether to approve, request replacement, or reject.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'orders.view');
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? undefined;

    const returns = await prisma.returnRequest.findMany({
      where: {
        order: { vendorId },
        ...(status ? { status } : {}),
      },
      include: {
        order: {
          select: { id: true, orderNumber: true, totalAmount: true, vendorId: true },
        },
        customer: {
          select: { id: true, fullName: true, email: true, businessName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: returns });
  } catch (error) {
    return errorResponse(error);
  }
});

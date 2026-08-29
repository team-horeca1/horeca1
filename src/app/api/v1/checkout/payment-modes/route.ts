/**
 * GET /api/v1/checkout/payment-modes?vendorIds=uuid,uuid
 * Returns per-vendor allowed payment modes for the logged-in customer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const DEFAULT_MODES = ['cod', 'prepaid', 'credit', 'cheque', 'online'];

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const vendorIds = new URL(req.url).searchParams.get('vendorIds')?.split(',').filter(Boolean) ?? [];
    if (vendorIds.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const mappings = await prisma.vendorCustomer.findMany({
      where: { userId: effectiveCustomerUserId(ctx), vendorId: { in: vendorIds } },
      select: { vendorId: true, allowedPaymentModes: true },
    });

    const byVendor: Record<string, string[]> = {};
    for (const vid of vendorIds) {
      const m = mappings.find((x) => x.vendorId === vid);
      byVendor[vid] = m?.allowedPaymentModes?.length ? m.allowedPaymentModes : DEFAULT_MODES;
    }

    return NextResponse.json({ success: true, data: byVendor });
  } catch (error) {
    return errorResponse(error);
  }
});

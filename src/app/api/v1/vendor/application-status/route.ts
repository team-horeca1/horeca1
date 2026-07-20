// GET /api/v1/vendor/application-status — Check if current user has a pending vendor application
// WHY: Homepage needs to show a "Your vendor profile is under review" banner
//      for users who signed up as vendor but haven't been approved yet.
// PROTECTED: Any authenticated user

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    // A user may own multiple Online Stores. Prefer any verified store so creating
    // an extra draft/unverified store does not lock the whole Supplier portal.
    const vendors = await prisma.vendor.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (vendors.length === 0) {
      return NextResponse.json({
        success: true,
        data: { hasApplication: false },
      });
    }

    const verified =
      (ctx.activeVendorId
        ? vendors.find((v) => v.id === ctx.activeVendorId && v.isVerified)
        : undefined)
      ?? vendors.find((v) => v.isVerified);

    if (verified) {
      return NextResponse.json({
        success: true,
        data: {
          hasApplication: true,
          status: 'approved',
          businessName: verified.businessName,
          appliedAt: verified.createdAt,
        },
      });
    }

    const newest = vendors[0];
    return NextResponse.json({
      success: true,
      data: {
        hasApplication: true,
        status: 'pending',
        businessName: newest.businessName,
        appliedAt: newest.createdAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

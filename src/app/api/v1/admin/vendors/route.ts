// GET  /api/v1/admin/vendors — List all vendors with details
// POST /api/v1/admin/vendors — Admin creates a vendor directly (auto-verified)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { createDirectVendor, createDirectVendorSchema } from '@/modules/vendor/vendorOnboarding.service';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'vendors.view');
  try {
    const params = req.nextUrl.searchParams;
    const verified = params.has('verified') ? params.get('verified') === 'true' : undefined;
    const search = params.get('search') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);

    // Build where clause
    const where: Record<string, unknown> = {};

    if (typeof verified === 'boolean') {
      where.isVerified = verified;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        rating: true,
        isVerified: true,
        isActive: true,
        creditEnabled: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    const hasMore = vendors.length > limit;
    if (hasMore) vendors.pop();

    const nextCursor = hasMore ? vendors[vendors.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: {
        vendors,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.create');
    const body = await req.json();
    const input = createDirectVendorSchema.parse(body);
    const result = await createDirectVendor(input, ctx.userId);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

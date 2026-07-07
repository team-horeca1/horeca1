// GET /api/v1/brand/vendors/search — Brand searches marketplace vendors to add as distributors
// REQUIRES: role=brand

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { AuthContext } from '@/middleware/auth';

const querySchema = z.object({
  q: z.string().max(120).optional(),
  city: z.string().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'vendors.view');
    const { brandId } = await resolveBrandContext(ctx, req);
    const params = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));

    const linked = await prisma.brandAuthorizedDistributor.findMany({
      where: { brandId, status: { in: ['approved', 'pending'] } },
      select: { vendorId: true },
    });
    const excludeIds = linked.map((r) => r.vendorId);

    const vendors = await prisma.vendor.findMany({
      where: {
        isActive: true,
        isVerified: true,
        id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
        ...(params.city && { city: { contains: params.city, mode: 'insensitive' as const } }),
        ...(params.pincode && {
          serviceAreas: { some: { pincode: params.pincode, isActive: true } },
        }),
        ...(params.q && {
          OR: [
            { businessName: { contains: params.q, mode: 'insensitive' } },
            { slug: { contains: params.q, mode: 'insensitive' } },
            { city: { contains: params.q, mode: 'insensitive' } },
            { user: { email: { contains: params.q, mode: 'insensitive' } } },
          ],
        }),
      },
      take: params.limit,
      orderBy: [{ businessName: 'asc' }],
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        city: true,
        _count: { select: { products: { where: { isActive: true, approvalStatus: 'approved' } } } },
      },
    });

    return NextResponse.json({ success: true, data: { vendors } });
  } catch (error) {
    return errorResponse(error);
  }
});

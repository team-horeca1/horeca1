// GET /api/v1/vendor/brand-mappings/brands — lightweight check for authorized brand relationships
// REQUIRES: role=vendor

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { approvedDistributorWhere } from '@/lib/brandAuthorizedDistributor';
import type { AuthContext } from '@/middleware/auth';

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'products.view');
    const { vendorId } = await resolveVendorContext(ctx, req);

    const rows = await prisma.brandAuthorizedDistributor.findMany({
      where: approvedDistributorWhere({ vendorId }),
      select: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
      orderBy: { brand: { name: 'asc' } },
    });

    const brands = rows.map((r) => r.brand);

    return NextResponse.json({
      success: true,
      data: { brands, hasAuthorizedBrands: brands.length > 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

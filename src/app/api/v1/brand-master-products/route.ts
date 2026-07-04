// GET /api/v1/brand-master-products?q=amul&limit=20 — Search brand master catalogs
// Vendors only see catalogs for brands they are authorized distributors of.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRole } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { approvedDistributorWhere } from '@/lib/brandAuthorizedDistributor';
import type { AuthContext } from '@/middleware/auth';

export const GET = withRole(['vendor', 'brand', 'admin'], async (req: NextRequest, ctx: AuthContext) => {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const brandId = req.nextUrl.searchParams.get('brandId')?.trim() ?? '';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20), 50);

    let allowedBrandIds: string[] | undefined;
    if (ctx.role === 'vendor') {
      const { vendorId } = await resolveVendorContext(ctx, req);
      const auths = await prisma.brandAuthorizedDistributor.findMany({
        where: approvedDistributorWhere({ vendorId }),
        select: { brandId: true },
      });
      allowedBrandIds = auths.map((a) => a.brandId);
      if (allowedBrandIds.length === 0) {
        return NextResponse.json({ success: true, data: { products: [] } });
      }
      if (brandId && !allowedBrandIds.includes(brandId)) {
        throw Errors.forbidden('Not authorized for this brand catalog');
      }
    }

    const where = {
      isActive: true,
      brand: { isActive: true, approvalStatus: 'approved' as const },
      ...(allowedBrandIds && { brandId: { in: brandId ? [brandId] : allowedBrandIds } }),
      ...(!allowedBrandIds && brandId && { brandId }),
      ...(q.length >= 2 ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { sku: { contains: q, mode: 'insensitive' as const } },
          { brand: { name: { contains: q, mode: 'insensitive' as const } } },
        ],
      } : {}),
    };

    const products = await prisma.brandMasterProduct.findMany({
      where,
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        packSize: true,
        unit: true,
        sku: true,
        imageUrl: true,
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    return NextResponse.json({ success: true, data: { products } });
  } catch (error) {
    return errorResponse(error);
  }
});

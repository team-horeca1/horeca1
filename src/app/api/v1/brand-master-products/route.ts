// GET /api/v1/brand-master-products?q=amul&limit=20 — Search brand master catalogs
// Any vendor can browse catalogs for active+approved brands (authorization is not required).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRole } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

export const GET = withRole(['vendor', 'brand', 'admin'], async (req: NextRequest, _ctx: AuthContext) => {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const brandId = req.nextUrl.searchParams.get('brandId')?.trim() ?? '';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20), 100);

    const where = {
      isActive: true,
      brand: { isActive: true, approvalStatus: 'approved' as const },
      ...(brandId && { brandId }),
      ...(q.length >= 1 ? {
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
        category: true,
        categoryRel: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    return NextResponse.json({ success: true, data: { products } });
  } catch (error) {
    return errorResponse(error);
  }
});

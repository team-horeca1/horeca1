// GET /api/v1/brand-master-products?q=amul&limit=20 — Search brand master catalogs
// Any vendor can browse catalogs for active+approved brands (authorization is not required).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRole } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';
import { getCategoryPickerMeta } from '@/modules/catalog/catalog.service';

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
        description: true,
        packSize: true,
        unit: true,
        sku: true,
        imageUrl: true,
        images: true,
        category: true,
        categoryId: true,
        categoryIds: true,
        hsn: true,
        barcode: true,
        fssaiRef: true,
        vegNonVeg: true,
        storageType: true,
        shelfLifeDays: true,
        countryOfOrigin: true,
        tags: true,
        aliasNames: true,
        netWeight: true,
        netWeightUnit: true,
        packageWeight: true,
        weightUnit: true,
        packageLength: true,
        packageWidth: true,
        packageHeight: true,
        dimensionUnit: true,
        categoryRel: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    const withCategories = await Promise.all(
      products.map(async (p) => {
        const rawIds =
          p.categoryIds.length > 0
            ? p.categoryIds
            : p.categoryId
              ? [p.categoryId]
              : [];
        const { categoryIds, categoryLeafMissing } = await getCategoryPickerMeta(rawIds);
        return { ...p, categoryIds, categoryLeafMissing };
      }),
    );

    return NextResponse.json({ success: true, data: { products: withCategories } });
  } catch (error) {
    return errorResponse(error);
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId } from '@/lib/resolveBrandId';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { exportBrandCatalogToXlsx } from '@/modules/import-export/brand-excel.service';
import type { AuthContext } from '@/middleware/auth';

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'products.view');
    const userId = await resolveUserId(ctx, req);
    const brand = await prisma.brand.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!brand) {
      return NextResponse.json({ success: false, error: { message: 'Brand not found' } }, { status: 404 });
    }

    const products = await prisma.brandMasterProduct.findMany({
      where: { brandId: brand.id, isActive: true },
      include: {
        categoryRel: {
          select: { name: true, parent: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows = products.map((p) => ({
      name: p.name,
      sku: p.sku,
      packSize: p.packSize,
      unit: p.unit,
      parentCategory: p.categoryRel?.parent?.name ?? p.categoryRel?.name ?? '',
      subCategory: p.categoryRel?.parent ? p.categoryRel.name : '',
      imageUrl: p.imageUrl,
      description: p.description,
    }));

    const buf = exportBrandCatalogToXlsx(rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="brand_catalog_export.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

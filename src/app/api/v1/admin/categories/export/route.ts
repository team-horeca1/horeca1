import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { exportCategoriesToXlsx, exportCategoriesToCsv } from '@/modules/import-export/excel.service';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'xlsx';

    const categories = await prisma.category.findMany({
      include: {
        parent: { select: { name: true } },
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const rows = categories.map(c => ({
      name: c.name,
      slug: c.slug,
      parentName: c.parent?.name,
      imageUrl: c.imageUrl,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      approvalStatus: c.approvalStatus,
      productCount: c._count.products,
    }));

    if (format === 'csv') {
      const csv = exportCategoriesToCsv(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="categories.csv"',
        },
      });
    }

    const buffer = exportCategoriesToXlsx(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="categories.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET  /api/v1/brand/products/import?template=true — Brand Store Excel template
// POST /api/v1/brand/products/import — Import brand catalog rows
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BrandService } from '@/modules/brand/brand.service';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId } from '@/lib/resolveBrandId';
import { errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import {
  parseBrandCatalogImport,
  generateBrandCatalogTemplate,
} from '@/modules/import-export/brand-excel.service';
import { resolveImportCategoryIds } from '@/modules/catalog/catalog.service';
import { validatePackUnitFields } from '@/lib/packSizeValidation';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

export const GET = brandOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'products.edit');
  if (req.nextUrl.searchParams.get('template') !== 'true') {
    return NextResponse.json({ success: false, error: { message: 'Use ?template=true' } }, { status: 400 });
  }
  const buf = generateBrandCatalogTemplate();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="brand_item_template.xlsx"',
    },
  });
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'products.edit');
    const userId = await resolveUserId(ctx, req);
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: { message: 'No file uploaded' } }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseBrandCatalogImport(buffer);

    const allCategories = await prisma.category.findMany({
      where: { isActive: true, approvalStatus: 'approved' },
      select: { id: true, name: true, slug: true },
    });
    const catMap = new Map<string, string>();
    for (const c of allCategories) {
      catMap.set(c.name.toLowerCase(), c.id);
      catMap.set(c.slug.toLowerCase(), c.id);
    }

    let created = 0;
    let updated = 0;
    const errors = [...parseErrors];

    for (const row of rows) {
      const packErr = validatePackUnitFields(row.packSize ?? '', row.unit ?? '');
      if (packErr) {
        errors.push({ row: row.row, message: packErr });
        continue;
      }

      let categoryIds: string[] = [];
      try {
        if (row.subCategory || row.parentCategory) {
          const resolved = await resolveImportCategoryIds({
            parentCategory: row.parentCategory,
            subCategory: row.subCategory,
            autoApprove: false,
            suggestedBy: userId,
            catMap,
          });
          categoryIds = resolved.categoryIds;
        }
      } catch (e: unknown) {
        errors.push({ row: row.row, message: friendlyErrorMessage(e, 'Invalid category') });
        continue;
      }

      if (categoryIds.length === 0) {
        errors.push({ row: row.row, message: 'Parent Category + Sub-Category required' });
        continue;
      }

      try {
        const existing = row.sku
          ? await brandService.findBrandProductBySku(userId, row.sku)
          : null;

        if (existing) {
          await brandService.updateMasterProduct(userId, existing.id, {
            name: row.name,
            packSize: row.packSize,
            unit: row.unit,
            categoryIds,
            imageUrl: row.imageUrl,
            description: row.aliasName,
          });
          updated += 1;
        } else {
          if (!row.sku) {
            errors.push({ row: row.row, message: 'SKU required for new products' });
            continue;
          }
          await brandService.createMasterProduct(userId, {
            name: row.name,
            sku: row.sku,
            packSize: row.packSize,
            unit: row.unit,
            categoryIds,
            imageUrl: row.imageUrl,
            description: row.aliasName,
          });
          created += 1;
        }
      } catch (e: unknown) {
        errors.push({ row: row.row, message: friendlyErrorMessage(e, 'Import failed') });
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, updated, totalRows: rows.length, errors },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

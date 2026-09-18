import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  generateCategoryImportTemplate,
  generateCategoryImportTemplateCsv,
  parseCategoryImport,
} from '@/modules/import-export/excel.service';
import { syncCategoryParentLinks } from '@/modules/catalog/catalog.service';
import { requirePermission } from '@/lib/permissions/engine';

/** GET ?template=true&format=xlsx|csv — blank import sheet with sample rows. */
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    if (req.nextUrl.searchParams.get('template') !== 'true') {
      return NextResponse.json(
        { success: false, error: { message: 'Use ?template=true&format=xlsx|csv' } },
        { status: 400 },
      );
    }

    const format = (req.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase();
    if (format === 'csv') {
      const csv = generateCategoryImportTemplateCsv();
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="category_import_template.csv"',
        },
      });
    }

    const buffer = generateCategoryImportTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="category_import_template.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw Errors.notFound('File');

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseCategoryImport(buffer);

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0, errors: parseErrors.length > 0 ? parseErrors : [{ row: 0, message: 'No valid rows found in file' }] },
      });
    }

    // Parent may be referenced by slug (parentSlug) or display name (export "Parent" column)
    const existingCats = await prisma.category.findMany({
      select: { id: true, slug: true, name: true },
    });
    const slugMap = new Map(existingCats.map(c => [c.slug, c.id]));
    const nameMap = new Map(existingCats.map(c => [c.name.toLowerCase(), c.id]));

    let created = 0;
    const createErrors: { row: number; message: string }[] = [...parseErrors];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const slug = row.slug || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Check if slug already exists
        if (slugMap.has(slug)) {
          createErrors.push({ row: rowNum, message: `Category slug "${slug}" already exists` });
          continue;
        }

        // Resolve parent by slug first, then case-insensitive name
        let parentId: string | null = null;
        if (row.parentSlug) {
          parentId =
            slugMap.get(row.parentSlug) ||
            nameMap.get(row.parentSlug.toLowerCase()) ||
            null;
          if (!parentId) {
            createErrors.push({
              row: rowNum,
              message: `Parent "${row.parentSlug}" not found (match by slug or name)`,
            });
            continue;
          }
          // Enforce the strict 2-level tree (B-3): the parent must itself be a root
          // (no parent of its own). Mirrors the POST/PATCH guards so import can't
          // smuggle in level-3 categories.
          const parent = await prisma.category.findUnique({
            where: { id: parentId },
            select: { parentId: true },
          });
          if (parent?.parentId) {
            createErrors.push({
              row: rowNum,
              message: `Parent "${row.parentSlug}" is itself a sub-category. Categories are a strict 2-level tree — only root categories can have children.`,
            });
            continue;
          }
        }

        const cat = await prisma.category.create({
          data: {
            name: row.name,
            slug,
            parentId,
            imageUrl: row.imageUrl || null,
            sortOrder: row.sortOrder || 0,
            isActive: true,
            approvalStatus: 'approved',
            approvedBy: ctx.userId,
            approvedAt: new Date(),
          },
        });

        if (parentId) {
          await syncCategoryParentLinks(cat.id, [parentId]);
        }

        // Add to lookup so subsequent rows can reference this as parent
        slugMap.set(cat.slug, cat.id);
        nameMap.set(cat.name.toLowerCase(), cat.id);
        created++;
      } catch (err) {
        createErrors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Failed to create category',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, errors: createErrors },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

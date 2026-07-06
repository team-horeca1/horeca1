import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { totalStockQty } from '@/lib/inventoryHelpers';
import {
  exportProductsToXlsx,
  exportProductsToCsv,
  type CategoryExportRow,
} from '@/modules/import-export/excel.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const vendorId = await resolveVendorId(ctx, req);

    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'xlsx';
    const isActive = url.searchParams.get('isActive') || undefined;
    const categoryId = url.searchParams.get('categoryId') || undefined;
    const search = url.searchParams.get('search') || undefined;

    const where: Record<string, unknown> = { vendorId };
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const products = await prisma.product.findMany({
      where,
      include: {
        vendor: { select: { businessName: true, vendorCode: true } },
        category: { select: { name: true, parentId: true, parent: { select: { name: true } } } },
        inventories: { select: { qtyAvailable: true } },
        priceSlabs: { orderBy: { sortOrder: 'asc' }, take: 3 },
        categoryLinks: {
          include: { category: { select: { name: true, parentId: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const rows = products.map((p) => {
      const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, unknown>;
      const primary = p.category;
      const parentCategory = primary?.parent?.name ?? (primary && !primary.parentId ? primary.name : '');
      const subCategory = primary?.parentId ? primary.name : '';
      const additional = p.categoryLinks
        ?.filter((l) => !l.isPrimary)
        .map((l) => l.category.name) ?? [];

      return {
        name: p.name,
        sku: p.sku,
        vendorSku: p.vendorSku,
        hsn: p.hsn,
        unit: p.unit,
        brand: p.brand,
        categoryName: p.category?.name,
        parentCategory,
        subCategory,
        additionalSubCategories: additional,
        basePrice: Number(p.basePrice),
        taxPercent: p.taxPercent ? Number(p.taxPercent) : 0,
        promoPrice: p.promoPrice ? Number(p.promoPrice) : null,
        imageUrl: p.imageUrl,
        imageName: p.imageUrl ? p.imageUrl.split('/').pop() || '' : '',
        stock: totalStockQty(p.inventories),
        approvalStatus: p.approvalStatus,
        barcode: p.barcode,
        aliasName: p.aliasNames?.[0] ?? null,
        minOrderQty: p.minOrderQty,
        vegNonVeg: p.vegNonVeg,
        storageType: p.storageType,
        vendorId: p.vendor?.vendorCode ?? String(meta.vendorId ?? ''),
        itemId: String(meta.itemId ?? p.id),
        metadata: meta,
        priceSlabs: p.priceSlabs.map((s) => ({
          minQty: s.minQty,
          price: Number(s.price),
          promoPrice: s.promoPrice ? Number(s.promoPrice) : null,
        })),
      };
    });

    // Fetch categories for the Categories sheet (xlsx only)
    let categories: CategoryExportRow[] = [];
    if (format === 'xlsx') {
      const cats = await prisma.category.findMany({
        where: { isActive: true },
        include: {
          parent: { select: { name: true } },
          _count: { select: { products: { where: { vendorId } } } },
        },
        orderBy: { sortOrder: 'asc' },
      });
      categories = cats.map(c => ({
        name: c.name,
        slug: c.slug,
        parentName: c.parent?.name,
        imageUrl: c.imageUrl,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        approvalStatus: c.approvalStatus,
        productCount: c._count.products,
      }));
    }

    if (format === 'csv') {
      const csv = exportProductsToCsv(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="products.csv"',
        },
      });
    }

    const buffer = exportProductsToXlsx(rows, categories);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="products.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

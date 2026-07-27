// GET  /api/v1/vendor/products/price-update?template=true — price-only Excel template
// POST /api/v1/vendor/products/price-update — Replace Prices (price fields only)
// WHY: Section 4 bulk price update without touching stock/name/category.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import {
  generatePriceUpdateTemplate,
  parsePriceUpdate,
} from '@/modules/import-export/excel.service';
import { buildImportErrorReportCsv, type ImportErrorRowData } from '@/modules/import-export/import-commit';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';

export const GET = vendorOnly(async (req: NextRequest) => {
  try {
    if (req.nextUrl.searchParams.get('template') !== 'true') {
      throw Errors.badRequest('Use ?template=true to download the price update template');
    }
    const buffer = generatePriceUpdateTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="price_update_template.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.edit');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw Errors.badRequest('File is required');

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parsePriceUpdate(buffer);

    const applyErrors: Array<{ row: number; field?: string; message: string }> = [...parseErrors];
    let updated = 0;
    const rowData = new Map<number, ImportErrorRowData>();

    for (const row of rows) {
      rowData.set(row.row, {
        name: '',
        sku: row.sku ?? row.vendorSku ?? '',
        netRate: row.basePrice,
      });

      const product = await prisma.product.findFirst({
        where: {
          vendorId,
          slug: { not: { startsWith: '_deleted_' } },
          OR: [
            ...(row.sku ? [{ sku: { equals: row.sku, mode: 'insensitive' as const } }] : []),
            ...(row.vendorSku
              ? [{ vendorSku: { equals: row.vendorSku, mode: 'insensitive' as const } }]
              : []),
          ],
        },
        select: {
          id: true,
          basePrice: true,
          priceSlabs: {
            orderBy: { sortOrder: 'asc' },
            select: { minQty: true, maxQty: true, price: true, promoPrice: true },
          },
        },
      });

      if (!product) {
        applyErrors.push({
          row: row.row,
          message: `No product found for SKU "${row.sku ?? ''}" / POS "${row.vendorSku ?? ''}"`,
        });
        continue;
      }

      try {
        const oldBase = Number(product.basePrice);
        await prisma.product.update({
          where: { id: product.id },
          data: { basePrice: row.basePrice },
        });

        const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
        if (oldBase !== row.basePrice) {
          changes.push({ field: 'basePrice', oldValue: oldBase, newValue: row.basePrice });
        }

        if (row.slabs.length > 0) {
          await prisma.priceSlab.deleteMany({ where: { productId: product.id, vendorId } });
          await prisma.priceSlab.createMany({
            data: row.slabs.slice(0, 3).map((s, idx) => ({
              productId: product.id,
              vendorId,
              minQty: s.minQty,
              maxQty: null,
              price: s.price,
              sortOrder: idx,
            })),
          });
          changes.push({
            field: 'priceSlabs',
            oldValue: summarizePriceSlabs(product.priceSlabs),
            newValue: summarizePriceSlabs(row.slabs),
          });
        }

        if (changes.length > 0) {
          await logProductFieldChanges(product.id, ctx.userId, 'import', changes);
        }
        updated++;
      } catch (err) {
        applyErrors.push({
          row: row.row,
          message: friendlyErrorMessage(err, 'Failed to update price'),
        });
      }
    }

    const errorReport =
      applyErrors.length > 0 ? buildImportErrorReportCsv(rowData, applyErrors) : undefined;

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        updated,
        errors: applyErrors,
        errorReport,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

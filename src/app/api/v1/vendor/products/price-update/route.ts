// GET  /api/v1/vendor/products/price-update — download current prices sheet
// POST /api/v1/vendor/products/price-update — upload edited prices (MOQ / tax / optional slabs)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import {
  exportPriceUpdateSheet,
  parsePriceUpdate,
} from '@/modules/import-export/excel.service';
import { buildImportErrorReportCsv, type ImportErrorRowData } from '@/modules/import-export/import-commit';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.view');

    const products = await prisma.product.findMany({
      where: {
        vendorId,
        slug: { not: { startsWith: '_deleted_' } },
      },
      select: {
        name: true,
        sku: true,
        vendorSku: true,
        minOrderQty: true,
        basePrice: true,
        taxPercent: true,
        priceSlabs: {
          orderBy: { sortOrder: 'asc' },
          take: 3,
          select: { minQty: true, price: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 5000,
    });

    const rows = products.map((p) => ({
      name: p.name,
      sku: (p.vendorSku || p.sku || '').trim() || p.sku || '',
      moq: p.minOrderQty ?? 1,
      basePrice: Number(p.basePrice),
      taxPercent: p.taxPercent != null ? Number(p.taxPercent) : 0,
      slabs: p.priceSlabs.map((s) => ({
        minQty: s.minQty,
        price: Number(s.price),
      })),
    }));

    const buffer = exportPriceUpdateSheet(rows);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="price_bulk_update_${date}.xlsx"`,
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
        sku: row.sku,
        netRate: row.basePrice,
      });

      const product = await prisma.product.findFirst({
        where: {
          vendorId,
          slug: { not: { startsWith: '_deleted_' } },
          OR: [
            { sku: { equals: row.sku, mode: 'insensitive' as const } },
            { vendorSku: { equals: row.sku, mode: 'insensitive' as const } },
          ],
        },
        select: {
          id: true,
          basePrice: true,
          taxPercent: true,
          minOrderQty: true,
          priceSlabs: {
            orderBy: { sortOrder: 'asc' },
            select: { minQty: true, maxQty: true, price: true, promoPrice: true },
          },
        },
      });

      if (!product) {
        applyErrors.push({
          row: row.row,
          message: `No product found for SKU "${row.sku}"`,
        });
        continue;
      }

      try {
        const oldBase = Number(product.basePrice);
        const oldTax = Number(product.taxPercent);
        const oldMoq = product.minOrderQty;

        const data: {
          basePrice: number;
          taxPercent: number;
          minOrderQty?: number;
        } = {
          basePrice: row.basePrice,
          taxPercent: row.taxPercent,
        };
        if (row.moq !== undefined) {
          data.minOrderQty = row.moq;
        }

        await prisma.product.update({
          where: { id: product.id },
          data,
        });

        const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
        if (oldBase !== row.basePrice) {
          changes.push({ field: 'basePrice', oldValue: oldBase, newValue: row.basePrice });
        }
        if (oldTax !== row.taxPercent) {
          changes.push({ field: 'taxPercent', oldValue: oldTax, newValue: row.taxPercent });
        }
        if (row.moq !== undefined && oldMoq !== row.moq) {
          changes.push({ field: 'minOrderQty', oldValue: oldMoq, newValue: row.moq });
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

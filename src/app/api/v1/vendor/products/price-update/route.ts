// GET  /api/v1/vendor/products/price-update — download current prices sheet
// POST /api/v1/vendor/products/price-update — preview or commit price updates

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import {
  exportPriceUpdateSheet,
  parsePriceUpdate,
  type PriceUpdateRow,
} from '@/modules/import-export/excel.service';
import { buildImportErrorReportCsv, type ImportErrorRowData } from '@/modules/import-export/import-commit';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';

type MatchedProduct = {
  id: string;
  name: string;
  basePrice: { toString(): string } | number;
  taxPercent: { toString(): string } | number;
  minOrderQty: number;
  priceSlabs: Array<{
    minQty: number;
    maxQty: number | null;
    price: unknown;
    promoPrice: unknown;
  }>;
};

function toGross(taxable: number, taxPercent: number): number {
  return Math.round(taxable * (1 + (taxPercent || 0) / 100) * 100) / 100;
}

async function findProductBySkuOrId(
  vendorId: string,
  key: string
): Promise<MatchedProduct | null> {
  const sku = key.trim();
  if (!sku) return null;

  return prisma.product.findFirst({
    where: {
      vendorId,
      slug: { not: { startsWith: '_deleted_' } },
      OR: [
        { id: sku },
        { sku: { equals: sku, mode: 'insensitive' as const } },
        { vendorSku: { equals: sku, mode: 'insensitive' as const } },
      ],
    },
    select: {
      id: true,
      name: true,
      basePrice: true,
      taxPercent: true,
      minOrderQty: true,
      priceSlabs: {
        orderBy: { sortOrder: 'asc' },
        select: { minQty: true, maxQty: true, price: true, promoPrice: true },
      },
    },
  });
}

async function applyPriceRow(
  vendorId: string,
  userId: string,
  row: PriceUpdateRow,
  product: MatchedProduct
): Promise<void> {
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
    await logProductFieldChanges(product.id, userId, 'import', changes);
  }
}

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
        id: true,
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
      sku: (p.vendorSku || p.sku || p.id).trim(),
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

    const contentType = req.headers.get('content-type') || '';
    let mode: 'preview' | 'commit' = 'preview';
    let rows: PriceUpdateRow[] = [];
    let parseErrors: Array<{ row: number; field?: string; message: string }> = [];

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        mode?: string;
        items?: Array<{
          row: number;
          sku: string;
          moq?: number;
          basePrice: number;
          taxPercent: number;
          slabs?: Array<{ minQty: number; price: number }>;
          skip?: boolean;
        }>;
      };
      mode = body.mode === 'commit' ? 'commit' : 'preview';
      rows = (body.items || [])
        .filter((i) => !i.skip)
        .map((i) => ({
          row: i.row,
          sku: String(i.sku || '').trim(),
          moq: i.moq,
          basePrice: Number(i.basePrice),
          taxPercent: Number(i.taxPercent),
          slabs: Array.isArray(i.slabs) ? i.slabs : [],
        }));
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) throw Errors.badRequest('File is required');
      const modeRaw = String(formData.get('mode') || 'preview').toLowerCase();
      mode = modeRaw === 'commit' ? 'commit' : 'preview';

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parsePriceUpdate(buffer);
      rows = parsed.rows;
      parseErrors = parsed.errors;
    }

    if (mode === 'preview') {
      const items: Array<{
        row: number;
        sku: string;
        name: string;
        productId: string | null;
        moq: number;
        basePrice: number;
        taxPercent: number;
        gross: number;
        slabs: Array<{ minQty: number; price: number }>;
        matched: boolean;
        error: string | null;
        skip: boolean;
      }> = [];

      for (const err of parseErrors) {
        items.push({
          row: err.row,
          sku: '',
          name: '',
          productId: null,
          moq: 1,
          basePrice: 0,
          taxPercent: 0,
          gross: 0,
          slabs: [],
          matched: false,
          error: err.message,
          skip: true,
        });
      }

      for (const row of rows) {
        if (!row.sku) {
          items.push({
            row: row.row,
            sku: '',
            name: '',
            productId: null,
            moq: row.moq ?? 1,
            basePrice: row.basePrice,
            taxPercent: row.taxPercent,
            gross: toGross(row.basePrice, row.taxPercent),
            slabs: row.slabs,
            matched: false,
            error: 'SKU is required',
            skip: true,
          });
          continue;
        }

        const product = await findProductBySkuOrId(vendorId, row.sku);
        if (!product) {
          items.push({
            row: row.row,
            sku: row.sku,
            name: '',
            productId: null,
            moq: row.moq ?? 1,
            basePrice: row.basePrice,
            taxPercent: row.taxPercent,
            gross: toGross(row.basePrice, row.taxPercent),
            slabs: row.slabs,
            matched: false,
            error: `No product found for SKU "${row.sku}"`,
            skip: true,
          });
          continue;
        }

        items.push({
          row: row.row,
          sku: row.sku,
          name: product.name,
          productId: product.id,
          moq: row.moq ?? product.minOrderQty ?? 1,
          basePrice: row.basePrice,
          taxPercent: row.taxPercent,
          gross: toGross(row.basePrice, row.taxPercent),
          slabs: row.slabs,
          matched: true,
          error: null,
          skip: false,
        });
      }

      items.sort((a, b) => a.row - b.row);

      return NextResponse.json({
        success: true,
        data: {
          mode: 'preview',
          totalRows: items.length,
          matched: items.filter((i) => i.matched).length,
          errored: items.filter((i) => i.error).length,
          items,
        },
      });
    }

    // commit
    const applyErrors: Array<{ row: number; field?: string; message: string }> = [...parseErrors];
    let updated = 0;
    const rowData = new Map<number, ImportErrorRowData>();

    for (const row of rows) {
      rowData.set(row.row, {
        name: '',
        sku: row.sku,
        netRate: row.basePrice,
      });

      if (!row.sku) {
        applyErrors.push({ row: row.row, message: 'SKU is required' });
        continue;
      }

      const product = await findProductBySkuOrId(vendorId, row.sku);
      if (!product) {
        applyErrors.push({
          row: row.row,
          message: `No product found for SKU "${row.sku}"`,
        });
        continue;
      }

      try {
        await applyPriceRow(vendorId, ctx.userId, row, product);
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
        mode: 'commit',
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

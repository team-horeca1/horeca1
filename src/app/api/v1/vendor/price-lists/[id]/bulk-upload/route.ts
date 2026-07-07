/**
 * POST /api/v1/vendor/price-lists/[id]/bulk-upload
 * ────────────────────────────────────────────────
 * Accepts a JSON array of pricing rows and bulk-upserts them onto the
 * pricelist. Mirrors the design of the product bulk-import: rows that
 * resolve successfully land in one tx; rows that don't surface in the
 * `errors` array so vendor can fix and re-submit instead of silently
 * dropping them.
 *
 * Body shape:
 *   {
 *     rows: Array<{
 *       sku?: string;
 *       productId?: string;
 *       customPrice?: number;
 *       pricingType?: 'fixed' | 'discount' | 'special' | 'scheme';
 *       discountPercent?: number;
 *       schemeMinQty?: number;
 *       schemeFreeQty?: number;
 *     }>
 *   }
 *
 * Response:
 *   { success: true, data: { matched, upserted, errors: [{row, message}] } }
 *
 * Multi-tenant: every SKU lookup AND every upsert is scoped to the
 * resolved vendorId — a row referencing a product from another vendor
 * lands in `errors`, never accidentally writes a foreign row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

const rowSchema = z.object({
  sku: z.string().max(100).optional(),
  productId: z.string().uuid().optional(),
  customPrice: z.number().min(0).optional(),
  pricingType: z.enum(['fixed', 'discount', 'special', 'scheme']).default('fixed'),
  discountPercent: z.number().min(0).max(100).optional(),
  schemeMinQty: z.number().int().min(1).optional(),
  schemeFreeQty: z.number().int().min(0).optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(2000),
});

function extractListId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../vendor/price-lists/<id>/bulk-upload
  return segments[segments.length - 2];
}

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const listId = extractListId(req);
    const body = bodySchema.parse(await req.json());

    // Confirm the pricelist exists under this vendor before doing any work.
    const list = await prisma.priceList.findFirst({
      where: { id: listId, vendorId },
      select: { id: true },
    });
    if (!list) throw Errors.notFound('Price list');

    // Resolve SKUs → productIds in one query. Rows without SKU but with
    // explicit productId skip the lookup.
    const skus = body.rows.flatMap((r) => (r.sku && !r.productId ? [r.sku] : []));
    const skuMap = new Map<string, string>();
    if (skus.length > 0) {
      const products = await prisma.product.findMany({
        where: { sku: { in: skus }, vendorId },
        select: { id: true, sku: true },
      });
      for (const p of products) if (p.sku) skuMap.set(p.sku, p.id);
    }

    // Also validate any explicit productIds belong to this vendor.
    const explicitIds = body.rows.flatMap((r) => (r.productId ? [r.productId] : []));
    const validIds = new Set<string>();
    if (explicitIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: explicitIds }, vendorId },
        select: { id: true },
      });
      for (const p of products) validIds.add(p.id);
    }

    // Walk the rows. Anything that can't resolve OR has bad type-specific
    // fields lands in `errors` instead of breaking the whole import.
    type Resolved = {
      productId: string;
      customPrice: number | null;
      pricingType: 'fixed' | 'discount' | 'special' | 'scheme';
      discountPercent: number | null;
      schemeMinQty: number | null;
      schemeFreeQty: number | null;
    };
    const resolved: Resolved[] = [];
    const errors: Array<{ row: number; message: string }> = [];

    body.rows.forEach((r, idx) => {
      const rowNum = idx + 1;
      let productId: string | undefined = r.productId && validIds.has(r.productId) ? r.productId : undefined;
      if (!productId && r.sku) productId = skuMap.get(r.sku);

      if (!productId) {
        errors.push({ row: rowNum, message: r.sku ? `SKU '${r.sku}' not found under this vendor` : 'productId not found' });
        return;
      }

      // Type-specific field validation.
      if (r.pricingType === 'discount') {
        if (typeof r.discountPercent !== 'number') {
          errors.push({ row: rowNum, message: 'discountPercent required for pricingType=discount' });
          return;
        }
      } else if (r.pricingType === 'scheme') {
        if (typeof r.customPrice !== 'number' || typeof r.schemeMinQty !== 'number') {
          errors.push({ row: rowNum, message: 'customPrice + schemeMinQty required for pricingType=scheme' });
          return;
        }
      } else {
        // fixed | special
        if (typeof r.customPrice !== 'number') {
          errors.push({ row: rowNum, message: 'customPrice required for pricingType=fixed/special' });
          return;
        }
      }

      resolved.push({
        productId,
        customPrice: r.customPrice ?? null,
        pricingType: r.pricingType,
        discountPercent: r.discountPercent ?? null,
        schemeMinQty: r.schemeMinQty ?? null,
        schemeFreeQty: r.schemeFreeQty ?? null,
      });
    });

    // De-dupe by productId — keep the last occurrence (matches the
    // semantic of "later row wins" if a vendor pastes the same SKU twice).
    const byProduct = new Map<string, Resolved>();
    for (const r of resolved) byProduct.set(r.productId, r);

    // Single transaction so the upsert is all-or-nothing per request.
    let upsertedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of byProduct.values()) {
        await tx.priceListItem.upsert({
          where: { priceListId_productId: { priceListId: listId, productId: r.productId } },
          create: {
            priceListId: listId,
            productId: r.productId,
            customPrice: r.customPrice,
            pricingType: r.pricingType,
            discountPercent: r.discountPercent,
            schemeMinQty: r.schemeMinQty,
            schemeFreeQty: r.schemeFreeQty,
          },
          update: {
            customPrice: r.customPrice,
            pricingType: r.pricingType,
            discountPercent: r.discountPercent,
            schemeMinQty: r.schemeMinQty,
            schemeFreeQty: r.schemeFreeQty,
          },
        });
        upsertedCount++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        matched: resolved.length,
        upserted: upsertedCount,
        errors,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

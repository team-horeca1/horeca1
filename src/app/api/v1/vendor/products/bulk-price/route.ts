// PATCH /api/v1/vendor/products/bulk-price — Apply % price adjustment to a category (or all products)
// WHY: Vendors with 100+ SKUs need to update prices in bulk (e.g. +5% after a supplier rate revision)
//      without editing each product individually.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';

const bulkPriceSchema = z.object({
  // null = apply to all products; uuid = apply only to this category
  categoryId: z.string().uuid().nullable(),
  adjustmentType: z.enum(['percent', 'fixed']),
  adjustmentValue: z.number(),   // % (can be negative to reduce) or absolute ₹ delta
  applyToSlabs: z.boolean().default(true),
  roundTo: z.number().int().min(0).max(2).default(2), // decimal places
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.edit');

    const body = bulkPriceSchema.parse(await req.json());

    const where: Record<string, unknown> = { vendorId };
    if (body.categoryId) where.categoryId = body.categoryId;

    const products = await prisma.product.findMany({
      where,
      select: { id: true, basePrice: true },
      include: body.applyToSlabs ? { priceSlabs: true } : undefined,
    } as Parameters<typeof prisma.product.findMany>[0]);

    const round = (n: number) => Math.round(n * 10 ** body.roundTo) / 10 ** body.roundTo;

    const apply = (price: number) => {
      const adj = body.adjustmentType === 'percent'
        ? price * (body.adjustmentValue / 100)
        : body.adjustmentValue;
      return Math.max(0.01, round(price + adj));
    };

    // Run all updates in a transaction
    await prisma.$transaction(
      products.flatMap(p => {
        const ops = [
          prisma.product.update({
            where: { id: p.id },
            data: { basePrice: apply(Number(p.basePrice)) },
          }),
        ];

        if (body.applyToSlabs && 'priceSlabs' in p && Array.isArray(p.priceSlabs)) {
          for (const slab of p.priceSlabs) {
            ops.push(
              prisma.priceSlab.update({
                where: { id: slab.id },
                data: { price: apply(Number(slab.price)) },
              }) as unknown as ReturnType<typeof prisma.product.update>,
            );
          }
        }

        return ops;
      }),
    );

    // Audit after commit (fire-and-forget per product)
    for (const p of products) {
      const oldBase = Number(p.basePrice);
      const newBase = apply(oldBase);
      const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [
        { field: 'basePrice', oldValue: oldBase, newValue: newBase },
      ];
      if (body.applyToSlabs && 'priceSlabs' in p && Array.isArray(p.priceSlabs) && p.priceSlabs.length > 0) {
        const oldSlabs = p.priceSlabs as Array<{
          minQty: number;
          maxQty: number | null;
          price: unknown;
          promoPrice?: unknown;
        }>;
        const newSlabs = oldSlabs.map((s) => ({
          ...s,
          price: apply(Number(s.price)),
        }));
        changes.push({
          field: 'priceSlabs',
          oldValue: summarizePriceSlabs(oldSlabs),
          newValue: summarizePriceSlabs(newSlabs),
        });
      }
      void logProductFieldChanges(p.id, ctx.userId, 'bulk_price', changes).catch(console.error);
    }

    return NextResponse.json({ success: true, updated: products.length });
  } catch (error) {
    return errorResponse(error);
  }
});

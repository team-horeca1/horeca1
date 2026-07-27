/**
 * POST /api/v1/vendor/price-lists/[id]/bulk-apply
 * ───────────────────────────────────────────────
 * Bulk-applies one pricing action to a selection of products on a price list,
 * powering the Bulk Update Engine's "Customer price" action. Each matched
 * product gets a PriceListItem upserted:
 *
 *   set      → pricingType 'fixed',    customPrice = value
 *   percent  → pricingType 'fixed',    customPrice = basePrice × (1 − value/100)
 *   discount → pricingType 'discount', discountPercent = value (dynamic)
 *
 * Body: { productIds: string[], action: { type: 'set'|'percent'|'discount', value } }
 *
 * Multi-tenant: the price list AND every product is scoped to the resolved
 * vendorId — products from another vendor are skipped, never written.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { logPriceHistory, type PriceHistoryEntry } from '@/lib/priceHistory';

const bodySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.object({
    type: z.enum(['set', 'percent', 'discount']),
    value: z.number().min(0),
  }),
});

function extractListId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../vendor/price-lists/<id>/bulk-apply
  return segments[segments.length - 2];
}

const round = (n: number) => Math.round(n * 100) / 100;

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const listId = extractListId(req);
    const body = bodySchema.parse(await req.json());

    const list = await prisma.priceList.findFirst({ where: { id: listId, vendorId }, select: { id: true } });
    if (!list) throw Errors.notFound('Price list');

    // Only operate on products that belong to this vendor.
    const products = await prisma.product.findMany({
      where: { id: { in: body.productIds }, vendorId },
      select: { id: true, basePrice: true },
    });

    const { type, value } = body.action;
    let upserted = 0;

    const existingItems = await prisma.priceListItem.findMany({
      where: { priceListId: listId, productId: { in: products.map((p) => p.id) } },
      select: { productId: true, customPrice: true, discountPercent: true },
    });
    const existingByProduct = new Map(existingItems.map((e) => [e.productId, e]));
    const priceHistoryEntries: PriceHistoryEntry[] = [];

    await prisma.$transaction(async (tx) => {
      for (const p of products) {
        let data: { pricingType: 'fixed' | 'discount'; customPrice: number | null; discountPercent: number | null };
        if (type === 'discount') {
          data = { pricingType: 'discount', customPrice: null, discountPercent: value };
        } else if (type === 'percent') {
          data = { pricingType: 'fixed', customPrice: Math.max(0.01, round(Number(p.basePrice) * (1 - value / 100))), discountPercent: null };
        } else {
          data = { pricingType: 'fixed', customPrice: Math.max(0.01, round(value)), discountPercent: null };
        }

        const prev = existingByProduct.get(p.id);
        const oldCustom = prev?.customPrice != null ? Number(prev.customPrice) : null;
        const oldDiscount = prev?.discountPercent != null ? Number(prev.discountPercent) : null;
        if (oldCustom !== data.customPrice) {
          priceHistoryEntries.push({
            vendorId,
            productId: p.id,
            priceListId: listId,
            field: 'customPrice',
            oldValue: oldCustom,
            newValue: data.customPrice,
            source: 'pricelist',
            changedBy: ctx.userId,
          });
        }
        if (oldDiscount !== data.discountPercent) {
          priceHistoryEntries.push({
            vendorId,
            productId: p.id,
            priceListId: listId,
            field: 'discountPercent',
            oldValue: oldDiscount,
            newValue: data.discountPercent,
            source: 'pricelist',
            changedBy: ctx.userId,
          });
        }

        await tx.priceListItem.upsert({
          where: { priceListId_productId: { priceListId: listId, productId: p.id } },
          create: { priceListId: listId, productId: p.id, ...data },
          update: data,
        });
        upserted++;
      }

      if (priceHistoryEntries.length > 0) {
        await logPriceHistory(priceHistoryEntries, tx);
      }
    });

    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.priceListBulkApply,
      entity: 'price_list',
      entityId: listId,
      metadata: { vendorId, type, value, matched: products.length, upserted },
    });

    return NextResponse.json({ success: true, data: { matched: products.length, upserted } });
  } catch (error) {
    return errorResponse(error instanceof z.ZodError ? Errors.badRequest(error.issues[0]?.message ?? 'Invalid input') : error);
  }
});

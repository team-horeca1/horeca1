/**
 * GET  /api/v1/vendor/price-lists/[id]/products
 *      Full visible catalogue for the product picker (client-side search).
 * PUT  /api/v1/vendor/price-lists/[id]/products
 *      Sync membership to exactly the given productIds.
 *      Newly added products get Base × (1 − discountPercent/100).
 *      Existing members keep their price. Unticked products are removed.
 *      Forces list.discountPercent = 0 (converts legacy percent lists).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  listCatalogueForPicker,
  syncListProducts,
} from '@/modules/pricing/pricelist-workspace.service';

function extractListId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../vendor/price-lists/<id>/products
  return segments[segments.length - 2] ?? '';
}

const putSchema = z.object({
  productIds: z.array(z.string().uuid()).max(5000),
  discountPercent: z.number().min(0).max(90).default(0),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const listId = extractListId(req);
    if (!listId) throw Errors.badRequest('Missing price list id');

    const products = await listCatalogueForPicker({ vendorId, listId });
    return NextResponse.json({ success: true, data: { products } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const listId = extractListId(req);
    if (!listId) throw Errors.badRequest('Missing price list id');

    const body = putSchema.parse(await req.json());
    const result = await syncListProducts({
      vendorId,
      actorId: ctx.userId,
      listId,
      productIds: body.productIds,
      discountPercent: body.discountPercent,
    });

    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.priceListSyncProducts,
      entity: 'price_list',
      entityId: listId,
      metadata: {
        vendorId,
        added: result.added,
        removed: result.removed,
        kept: result.kept,
        discountPercent: body.discountPercent,
        productCount: body.productIds.length,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? Errors.badRequest(error.issues[0]?.message ?? 'Invalid input')
        : error,
    );
  }
});

// POST /api/v1/cart/merge — Merge a guest's localStorage cart into the user's
// server cart on login.
// PROTECTED: Must be logged in (called immediately after sign-in).
// BODY: { items: [{ productId, vendorId, quantity }] }
// SEMANTICS: For each guest item, if the user already has the same productId
// in their server cart we keep the LARGER quantity (assume user wants it all).
// Server-side product validation still runs via cartService.addItem so we
// inherit the isActive / approvalStatus / minOrderQty checks.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CartService, resolveCartContext } from '@/modules/cart/cart.service';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

const cartService = new CartService();

const mergeSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    vendorId: z.string().uuid(),
    quantity: z.number().int().min(1).max(10000),
  })).max(200), // sanity cap so a malicious client can't DoS
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.order');
    const cartCtx = await resolveCartContext(ctx);
    const body = await req.json();
    const { items } = mergeSchema.parse(body);

    if (items.length === 0) {
      return NextResponse.json({ success: true, data: { merged: 0, skipped: 0 } });
    }

    const existing = await cartService.getCart(cartCtx);
    // Flatten existing items into a productId → quantity map
    const existingQty = new Map<string, number>();
    for (const group of existing.vendorGroups ?? []) {
      for (const item of group.items ?? []) {
        existingQty.set(item.productId, Number(item.quantity));
      }
    }

    let merged = 0;
    let skipped = 0;
    for (const item of items) {
      const have = existingQty.get(item.productId) ?? 0;
      const target = Math.max(have, item.quantity);
      if (target === have) {
        skipped++;
        continue;
      }
      try {
        await cartService.addItem(cartCtx, item.productId, item.vendorId, target);
        merged++;
      } catch {
        // Per-item validation failures (deactivated product, MOQ change, etc.)
        // shouldn't kill the whole merge — just skip and continue.
        skipped++;
      }
    }

    return NextResponse.json({ success: true, data: { merged, skipped } });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH  /api/v1/cart/items/:id — Update quantity of a cart item
// DELETE /api/v1/cart/items/:id — Remove a specific item from cart
// V2.2: Scoped to the active outlet's cart (resolveCartContext).
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { CartService, resolveCartContext } from '@/modules/cart/cart.service';
import { updateCartItemSchema } from '@/modules/cart/cart.validator';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

const cartService = new CartService();

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.order');
    const cartCtx = await resolveCartContext(ctx);
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const itemId = segments[segments.length - 1];

    const body = await req.json();
    const { quantity } = updateCartItemSchema.parse(body);

    const item = await cartService.updateQuantity(cartCtx, itemId, quantity);
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.order');
    const cartCtx = await resolveCartContext(ctx);
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const itemId = segments[segments.length - 1];

    await cartService.removeItem(cartCtx, itemId);
    return NextResponse.json({ success: true, message: 'Item removed' });
  } catch (error) {
    return errorResponse(error);
  }
});

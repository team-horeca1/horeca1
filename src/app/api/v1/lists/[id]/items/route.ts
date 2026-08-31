// POST   /api/v1/lists/:id/items — Add a product to the list
// DELETE /api/v1/lists/:id/items?itemId=xxx — Remove a product from the list
// WHY: Users manage their quick order lists by adding/removing products
//      Each item has a "default quantity" — pre-filled when they reorder from the list
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { ListService } from '@/modules/list/list.service';
import { addListItemSchema } from '@/modules/list/list.validator';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const listService = new ListService();

// POST — add item to list
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/lists/{id}/items → listId is segments[4]
    const listId = segments[4];

    const body = await req.json();
    const { productId, vendorId, defaultQty } = addListItemSchema.parse(body);

    const item = await listService.addItem(listId, effectiveCustomerUserId(ctx), productId, vendorId, defaultQty);
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — remove item from list (pass itemId as query param)
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const listId = segments[4];
    const itemId = req.nextUrl.searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'itemId query param required' } },
        { status: 400 }
      );
    }

    await listService.removeItem(listId, effectiveCustomerUserId(ctx), itemId);
    return NextResponse.json({ success: true, message: 'Item removed' });
  } catch (error) {
    return errorResponse(error);
  }
});

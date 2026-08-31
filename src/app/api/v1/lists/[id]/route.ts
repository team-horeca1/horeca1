// GET    /api/v1/lists/:id — Get list details with all items (including current prices + stock)
// DELETE /api/v1/lists/:id — Delete a list
// WHY: GET shows the full list with live prices and stock — so the user sees if prices changed
//      since they last ordered. DELETE lets them clean up old lists.
// PROTECTED: Must be logged in (and can only access their own lists)

import { NextRequest, NextResponse } from 'next/server';
import { ListService } from '@/modules/list/list.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const listService = new ListService();

// GET — list detail with product prices and stock
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const listId = segments[segments.length - 1];

    const list = await listService.getById(listId, effectiveCustomerUserId(ctx));
    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — remove list and all its items
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const listId = segments[segments.length - 1];

    await listService.delete(listId, effectiveCustomerUserId(ctx));
    return NextResponse.json({ success: true, message: 'List deleted' });
  } catch (error) {
    return errorResponse(error);
  }
});

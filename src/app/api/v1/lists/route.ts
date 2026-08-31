// GET  /api/v1/lists — List all quick order lists for the current user
// POST /api/v1/lists — Create a new quick order list
// WHY: Quick Order Lists are reusable procurement templates
//      B2B customers order the same items every week — instead of adding items one by one,
//      they save a list ("Weekly Vegetables") and reorder with one click
//      Each list is tied to a specific vendor (since different vendors have different products)
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { ListService } from '@/modules/list/list.service';
import { createListSchema } from '@/modules/list/list.validator';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerBusinessAccountId, effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const listService = new ListService();

// GET — all lists with item counts
export const GET = withAuth(async (_req, ctx) => {
  try {
    const lists = await listService.getAll(effectiveCustomerUserId(ctx));
    return NextResponse.json({ success: true, data: lists });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — create new list (optionally with items)
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const data = createListSchema.parse(body);

    const businessAccountId = effectiveCustomerBusinessAccountId(ctx);
    if (!businessAccountId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ACTIVE_ACCOUNT', message: 'Pick an account before creating lists.' } },
        { status: 400 },
      );
    }
    const list = await listService.create(effectiveCustomerUserId(ctx), businessAccountId, data);
    return NextResponse.json({ success: true, data: list }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

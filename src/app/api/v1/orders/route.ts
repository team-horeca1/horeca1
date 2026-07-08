// GET  /api/v1/orders — List the current user's orders
// POST /api/v1/orders — Create new purchase order(s) from cart
// WHY: GET powers the "My Orders" page (order history)
//      POST is the checkout action — the most critical endpoint in the entire app
//      It runs inside a database transaction:
//        1. Check stock availability
//        2. Verify vendor minimum order value (MOV)
//        3. Calculate bulk pricing for each item
//        4. Create order + order items
//        5. Reserve inventory (so another customer can't buy the same stock)
//        6. Clear the cart
//      If ANY step fails, everything rolls back (nothing is half-created)
// PROTECTED: Must be logged in
// SUPPORTS: ?status=pending&vendorId=xxx&cursor=xxx&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { resolveStorefrontContext } from '@/lib/resolveStorefrontContext';
import { OrderService } from '@/modules/order/order.service';
import { createOrderSchema, listOrdersSchema } from '@/modules/order/order.validator';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const orderService = new OrderService();

// GET — list orders with optional filters
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const queryParams = Object.fromEntries(req.nextUrl.searchParams);
    const options = listOrdersSchema.parse(queryParams);

    const result = await orderService.list(effectiveCustomerUserId(ctx), options);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — create purchase order (the checkout action)
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    // Vendor/brand team members need explicit storefront.order to place orders.
    // Customers (legacy role or active customer account) and admins are unrestricted.
    requireStorefrontAccess(ctx, 'storefront.order');
    // Rate limit: 10 orders per user per minute (prevents checkout spam)
    const { allowed } = await checkRateLimit(`order:${ctx.userId}`, 10, 60000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many order attempts. Please wait.' } },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const body = await req.json();
    const input = createOrderSchema.parse(body);

    const storefrontCtx = await resolveStorefrontContext(ctx);
    const result = await orderService.create(storefrontCtx, input);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/payments/initiate — Create a Razorpay payment order
// WHY: Before showing the Razorpay checkout popup, we need to create an "order" on Razorpay's side
//      This gives us a razorpay_order_id that the frontend passes to Razorpay's SDK
// FLOW: Frontend sends orderId → we create Razorpay order → return razorpay_order_id to frontend
//       → frontend opens Razorpay popup → user pays → frontend gets signature → calls /verify
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '@/modules/payment/payment.service';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

// Accept either a single orderId (legacy callers) or an orderIds array (multi-PO combined checkout).
const initiateSchema = z.union([
  z.object({ orderId: z.string().uuid('Invalid order ID') }),
  z.object({ orderIds: z.array(z.string().uuid('Invalid order ID')).min(1, 'At least one order required') }),
]);

const paymentService = new PaymentService();

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    // Vendor/brand team members need explicit storefront.pay to initiate payments.
    // Customers (legacy role or active customer account) and admins are unrestricted.
    requireStorefrontAccess(ctx, 'storefront.pay');
    // Rate limit: 10 payment initiations per user per minute
    const { allowed } = await checkRateLimit(`payment:${ctx.userId}`, 10, 60000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait.' } },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const body = await req.json();
    const parsed = initiateSchema.parse(body);
    const orderIds = 'orderIds' in parsed ? parsed.orderIds : [parsed.orderId];
    const payerUserId = effectiveCustomerUserId(ctx);
    const result = await paymentService.initiate(orderIds, payerUserId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/payments/abandon — Customer dismissed Razorpay / payment failed client-side
// Cancels unpaid pending online orders and releases reserved stock.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '@/modules/payment/payment.service';
import { withAuth } from '@/middleware/auth';
import { requireStorefrontAccess } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

const abandonSchema = z.object({
  razorpay_order_id: z.string().min(1),
});

const paymentService = new PaymentService();

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    requireStorefrontAccess(ctx, 'storefront.pay');
    const body = abandonSchema.parse(await req.json());
    const result = await paymentService.abandon(body.razorpay_order_id, ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

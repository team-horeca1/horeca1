// POST /api/v1/payments/verify — Verify Razorpay payment signature
// WHY: After user pays through Razorpay popup, Razorpay gives the frontend 3 values:
//      razorpay_order_id, razorpay_payment_id, razorpay_signature
//      We MUST verify the signature using HMAC-SHA256 to confirm the payment is genuine
//      (prevents someone from faking a payment by sending fake data)
// FLOW: Frontend sends 3 values → we verify HMAC → update payment + order status → return success
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '@/modules/payment/payment.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1, 'razorpay_order_id is required'),
  razorpay_payment_id: z.string().min(1, 'razorpay_payment_id is required'),
  razorpay_signature: z.string().min(1, 'razorpay_signature is required'),
});

const paymentService = new PaymentService();

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = verifySchema.parse(body);

    const result = await paymentService.verify(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      effectiveCustomerUserId(ctx),
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST /api/v1/wallet/verify-repayment — synchronous, client-driven verification
// of a credit-wallet repayment. The Razorpay checkout handler posts the three
// values Razorpay returns (order/payment/signature); we HMAC-verify and apply
// the repayment immediately. This is the PRIMARY path — it does NOT depend on
// Razorpay calling our webhook back (which never happens in test mode/localhost).
// The razorpay-webhook route remains as an idempotent server-to-server backup.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const schema = z.object({
  razorpay_order_id: z.string().min(1, 'razorpay_order_id is required'),
  razorpay_payment_id: z.string().min(1, 'razorpay_payment_id is required'),
  razorpay_signature: z.string().min(1, 'razorpay_signature is required'),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = schema.parse(await req.json());
    const result = await creditWalletService.verifyRepayment(
      effectiveCustomerUserId(ctx),
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

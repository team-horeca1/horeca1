// POST /api/v1/payments/webhook — Razorpay server-to-server webhook
// WHY: Razorpay fires this even when the user closes the browser before /verify runs.
//      payment.captured marks the order paid. payment.authorized is captured first;
//      the order stays unpaid until Razorpay confirms captured. refund.processed
//      marks a paid order's paymentStatus refunded without rewinding fulfillment.
//
// SECURITY NOTES:
//   - No auth middleware — Razorpay calls this unauthenticated.
//   - Authenticity is verified via HMAC-SHA256 (RAZORPAY_WEBHOOK_SECRET).
//   - Raw body MUST be read with req.text() — JSON.parse would break the HMAC check
//     because the string used for signing is the exact raw bytes Razorpay sent.
//   - Returns 200 on all non-signature errors so Razorpay does not retry indefinitely.
//   - Returns 400 only on invalid signature (replay / spoofing attempts).

import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/modules/payment/payment.service';
import { ApiError } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';

const paymentService = new PaymentService();

async function postHandler(req: NextRequest): Promise<NextResponse> {
  // Read the raw body — must NOT be parsed before HMAC verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  try {
    const result = await paymentService.handleWebhook(rawBody, signature);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // Invalid signature → 400 so we don't ack a forged request
    if (error instanceof ApiError && error.statusCode === 401) {
      console.warn('[Webhook] Invalid Razorpay signature — possible spoofing attempt');
      return NextResponse.json(
        { received: false, error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Any other error → 200 so Razorpay does not keep retrying
    // The error is logged for investigation but we don't want a retry storm.
    console.error('[Webhook] Unexpected error processing Razorpay event:', error);
    return NextResponse.json({ received: true, error: 'Processing error — logged' });
  }
}

export const POST = withRateLimit(postHandler, 'webhook');

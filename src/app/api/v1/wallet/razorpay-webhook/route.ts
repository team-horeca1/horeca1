// POST /api/v1/wallet/razorpay-webhook — Razorpay capture -> apply repayment.
// Public endpoint, but HMAC-signature verified + idempotent (applyRepayment dedupes
// on razorpayPaymentId, backed by a unique index).
// payment.authorized is captured here before credit is applied. A signature alone
// is not enough — the repayment stays PENDING until Razorpay status is captured.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { errorResponse } from '@/middleware/errorHandler';
import {
  CapturePendingError,
  PaymentNotCapturedError,
  ensurePaymentCaptured,
} from '@/lib/razorpayCapture';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!signature || !secret) {
      return NextResponse.json({ success: false, error: 'Missing signature/secret' }, { status: 400 });
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } };
    };
    const entity = event.payload?.payment?.entity;
    const razorpayOrderId = entity?.order_id;
    const razorpayPaymentId = entity?.id;

    if (
      (event.event === 'payment.authorized' || event.event === 'payment.captured')
      && razorpayOrderId
      && razorpayPaymentId
    ) {
      const repayment = await prisma.creditWalletRepayment.findFirst({
        where: { razorpayOrderId },
      });
      if (repayment) {
        const expectedPaise = Math.round(Number(repayment.amount) * 100);
        try {
          // Always read the live payment. A payment.captured payload can arrive
          // after the payment was refunded, and a payment.authorized payload can
          // describe an earlier state that is already captured.
          await ensurePaymentCaptured(razorpayPaymentId, expectedPaise);
          await creditWalletService.applyRepayment(
            repayment.walletId,
            Number(repayment.amount),
            'RAZORPAY',
            razorpayOrderId,
            razorpayPaymentId,
          );
        } catch (err) {
          if (err instanceof CapturePendingError || err instanceof PaymentNotCapturedError) {
            return NextResponse.json({ success: true, applied: false });
          }
          throw err;
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

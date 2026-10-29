// Payment reconciliation — safety net for missed Razorpay webhooks.
// Finds Payment rows stuck in 'created' or 'authorized', asks Razorpay what
// actually happened, captures anything still authorized, and settles them the
// same way payment.service.ts verify/webhook would.
// An authorized payment is never failed: Razorpay auto-refunds it if we drop it.
// Run: npm run worker:reconciliation (hourly cron on the droplet).

import { prisma } from '@/lib/prisma';
import { getRazorpay } from '@/lib/razorpay';
import { PaymentService } from '@/modules/payment/payment.service';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import {
  CapturePendingError,
  PaymentNotCapturedError,
  RAZORPAY_CAPTURE_WINDOW_MS,
  ensurePaymentCaptured,
} from '@/lib/razorpayCapture';

const paymentService = new PaymentService();

export async function reconcilePayments() {
  console.log('[Reconciliation] Starting payment reconciliation...');

  // Skip the last 10 minutes so an in-flight checkout can finish verify itself.
  // Look back across the full capture window (5 days). Older rows are left for
  // the audit script — failing them does not collect the money.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const windowStart = new Date(Date.now() - RAZORPAY_CAPTURE_WINDOW_MS);

  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: { in: ['created', 'authorized'] },
      createdAt: { gte: windowStart, lte: tenMinutesAgo },
      razorpayOrderId: { not: null },
    },
  });

  console.log(`[Reconciliation] Found ${pendingPayments.length} pending payments to reconcile.`);

  const seen = new Set<string>();
  let successCount = 0;
  let failCount = 0;

  for (const payment of pendingPayments) {
    const razorpayOrderId = payment.razorpayOrderId;
    if (!razorpayOrderId || seen.has(razorpayOrderId)) continue;
    seen.add(razorpayOrderId);

    try {
      const siblingPayments = await prisma.payment.findMany({ where: { razorpayOrderId } });
      const expectedPaise = Math.round(siblingPayments.reduce((sum, p) => sum + Number(p.amount), 0) * 100);
      const paymentsResponse = await getRazorpay().orders.fetchPayments(razorpayOrderId);
      const items = paymentsResponse.items ?? [];
      const capturedPayment = items.find((p) => p.status === 'captured');
      const authorizedPayment = items.find((p) => p.status === 'authorized');
      const refundedPayment = items.find((p) => p.status === 'refunded');

      if (capturedPayment) {
        try {
          const captured = await ensurePaymentCaptured(capturedPayment.id, expectedPaise);
          console.log(`[Reconciliation] Captured payment ${captured.id} found for ${razorpayOrderId}. Marking PAID.`);
          await paymentService.settleCapturedCheckout({
            razorpayOrderId,
            razorpayPaymentId: captured.id,
            method: captured.method,
          });
          successCount++;
        } catch (err) {
          if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded') {
            await paymentService.recordGatewayRefund(capturedPayment.id, expectedPaise);
            console.log(`[Reconciliation] ${razorpayOrderId} listed captured then read as refunded.`);
          } else {
            console.error(`[Reconciliation] Refused to settle ${razorpayOrderId}:`, err);
          }
        }
        continue;
      }

      if (authorizedPayment) {
        try {
          const captured = await ensurePaymentCaptured(authorizedPayment.id, expectedPaise);
          console.log(`[Reconciliation] Captured authorized payment ${captured.id} for ${razorpayOrderId}.`);
          await paymentService.settleCapturedCheckout({
            razorpayOrderId,
            razorpayPaymentId: captured.id,
            method: captured.method,
          });
          successCount++;
        } catch (err) {
          if (err instanceof CapturePendingError) {
            await paymentService.rememberAuthorized(razorpayOrderId, authorizedPayment.id);
            console.log(`[Reconciliation] ${razorpayOrderId} still authorized. Not failing it.`);
          } else if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded') {
            await prisma.payment.updateMany({
              where: { razorpayOrderId, razorpayPaymentId: null },
              data: { razorpayPaymentId: authorizedPayment.id },
            });
            await paymentService.recordGatewayRefund(authorizedPayment.id, expectedPaise);
            console.log(`[Reconciliation] ${razorpayOrderId} was refunded by Razorpay.`);
          } else {
            console.error(`[Reconciliation] Could not capture ${razorpayOrderId}:`, err);
          }
        }
        continue;
      }

      if (refundedPayment) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId, razorpayPaymentId: null },
          data: { razorpayPaymentId: refundedPayment.id },
        });
        await paymentService.recordGatewayRefund(refundedPayment.id, Number(refundedPayment.amount));
        console.log(`[Reconciliation] ${razorpayOrderId} refunded at Razorpay.`);
        continue;
      }

      // Nothing authorized or captured. Fail only created rows after 2 hours.
      // Authorized rows stay until the capture window so we can still collect.
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const stillAuthorized = siblingPayments.some((p) => p.status === 'authorized');
      if (!stillAuthorized && payment.createdAt < twoHoursAgo) {
        console.log(`[Reconciliation] ${razorpayOrderId} unpaid after 2 hours. Failing + cancelling.`);
        await paymentService.failUnpaidCheckout(
          razorpayOrderId,
          'Payment timeout / missed checkout',
        );
        failCount++;
      } else {
        console.log(`[Reconciliation] ${razorpayOrderId} still within the capture window. Skipping.`);
      }
    } catch (error) {
      console.error(`[Reconciliation] Failed to reconcile payment ${payment.id}:`, error);
    }
  }

  await reconcileWalletRepayments(windowStart, tenMinutesAgo);

  console.log(`[Reconciliation] Done. Reconciled paid: ${successCount}, marked failed: ${failCount}`);
}

/**
 * Wallet repayments use a separate webhook URL. If that URL is not subscribed,
 * a customer who closes the browser after authorization never gets credit, and
 * Razorpay can still capture or later refund the payment. This pass applies
 * credit only after the live payment is captured, and never applies a refund.
 */
async function reconcileWalletRepayments(windowStart: Date, tenMinutesAgo: Date) {
  const pending = await prisma.creditWalletRepayment.findMany({
    where: {
      status: 'PENDING',
      razorpayOrderId: { not: null },
      createdAt: { gte: windowStart, lte: tenMinutesAgo },
    },
  });
  console.log(`[Reconciliation] Found ${pending.length} pending wallet repayments.`);

  for (const row of pending) {
    const razorpayOrderId = row.razorpayOrderId;
    if (!razorpayOrderId) continue;
    let expectedPaise = 0;
    let gatewayId = '';
    try {
      const paymentsResponse = await getRazorpay().orders.fetchPayments(razorpayOrderId);
      const items = paymentsResponse.items ?? [];
      const gateway = items.find((p) => p.status === 'captured') ?? items.find((p) => p.status === 'authorized');
      if (!gateway) continue;
      expectedPaise = Math.round(Number(row.amount) * 100);
      gatewayId = gateway.id;
      const captured = await ensurePaymentCaptured(gateway.id, expectedPaise);
      await creditWalletService.applyRepayment(
        row.walletId,
        Number(row.amount),
        'RAZORPAY',
        razorpayOrderId,
        captured.id,
      );
      console.log(`[Reconciliation] Applied wallet repayment ${row.id} from ${captured.id}.`);
    } catch (err) {
      if (err instanceof CapturePendingError) {
        console.log(`[Reconciliation] Wallet repayment ${row.id} still authorized.`);
      } else if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded' && gatewayId) {
        await creditWalletService.reverseRazorpayRepayment(gatewayId, expectedPaise, `reconcile:${gatewayId}`);
        console.log(`[Reconciliation] Wallet repayment ${row.id} refunded at Razorpay. Ledger restored.`);
      } else if (err instanceof PaymentNotCapturedError) {
        console.log(`[Reconciliation] Wallet repayment ${row.id} not applied: ${err.gatewayStatus}.`);
      } else {
        console.error(`[Reconciliation] Wallet repayment ${row.id} failed:`, err);
      }
    }
  }
}

// Run immediately when executed directly
if (require.main === module || (process.argv[1] && process.argv[1].endsWith('reconciliation.worker.ts'))) {
  reconcilePayments()
    .then(() => {
      console.log('[Reconciliation] Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Reconciliation] Fatal error:', err);
      process.exit(1);
    });
}

// Payment reconciliation — safety net for missed Razorpay webhooks.
// Finds Payment rows stuck in 'created', asks Razorpay what actually happened,
// and settles them the same way payment.service.ts verify/webhook would.
// Run: npm run worker:reconciliation (hourly cron on the droplet).

import { prisma } from '@/lib/prisma';
import { getRazorpay } from '@/lib/razorpay';
import { emitEvent } from '@/events/emitter';
import { PaymentService } from '@/modules/payment/payment.service';

const paymentService = new PaymentService();

export async function reconcilePayments() {
  console.log('[Reconciliation] Starting payment reconciliation...');

  // Stuck in 'created' for >10 minutes but <24 hours (older ones are dead).
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: 'created',
      createdAt: { gte: oneDayAgo, lte: tenMinutesAgo },
      razorpayOrderId: { not: null },
    },
  });

  console.log(`[Reconciliation] Found ${pendingPayments.length} pending payments to reconcile.`);

  // A combined checkout shares one razorpayOrderId across several Payment rows —
  // process each Razorpay order once.
  const seen = new Set<string>();
  let successCount = 0;
  let failCount = 0;

  for (const payment of pendingPayments) {
    const razorpayOrderId = payment.razorpayOrderId;
    if (!razorpayOrderId || seen.has(razorpayOrderId)) continue;
    seen.add(razorpayOrderId);

    try {
      const paymentsResponse = await getRazorpay().orders.fetchPayments(razorpayOrderId);
      const capturedPayment = paymentsResponse.items.find((p) => p.status === 'captured');

      if (capturedPayment) {
        console.log(`[Reconciliation] Captured payment ${capturedPayment.id} found for ${razorpayOrderId}. Marking PAID.`);

        const siblingPayments = await prisma.payment.findMany({ where: { razorpayOrderId } });
        const needsUpdate = siblingPayments.some((p) => p.status !== 'captured');

        if (needsUpdate) {
          await prisma.$transaction([
            prisma.payment.updateMany({
              where: { razorpayOrderId },
              data: {
                razorpayPaymentId: capturedPayment.id,
                status: 'captured',
                method: capturedPayment.method ?? null,
              },
            }),
            // paymentStatus reflects reality even for cancelled orders (ops
            // must refund those); the workflow status only moves forward from
            // 'pending' — never resurrect cancelled or rewind in-flight orders.
            prisma.order.updateMany({
              where: { id: { in: siblingPayments.map((p) => p.orderId) }, status: { not: 'cancelled' } },
              data: { paymentStatus: 'paid' },
            }),
            prisma.order.updateMany({
              where: { id: { in: siblingPayments.map((p) => p.orderId) }, status: 'pending' },
              data: { status: 'confirmed' },
            }),
          ]);

          for (const sibling of siblingPayments) {
            emitEvent('PaymentReceived', {
              orderId: sibling.orderId,
              paymentId: sibling.id,
              userId: sibling.userId,
              vendorId: sibling.vendorId,
              amount: Number(sibling.amount),
            });
            emitEvent('OrderConfirmed', {
              orderId: sibling.orderId,
              userId: sibling.userId,
              vendorId: sibling.vendorId,
            });
          }
        }
        successCount++;
      } else {
        // No capture and the checkout window has clearly lapsed → fail payment
        // and cancel unpaid pending orders (releases reserved stock).
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        if (payment.createdAt < twoHoursAgo) {
          console.log(`[Reconciliation] ${razorpayOrderId} unpaid after 2 hours. Failing + cancelling.`);
          await paymentService.failUnpaidCheckout(
            razorpayOrderId,
            'Payment timeout / missed checkout',
          );
          failCount++;
        } else {
          console.log(`[Reconciliation] ${razorpayOrderId} still within the 2-hour window. Skipping.`);
        }
      }
    } catch (error) {
      console.error(`[Reconciliation] Failed to reconcile payment ${payment.id}:`, error);
    }
  }

  console.log(`[Reconciliation] Done. Reconciled paid: ${successCount}, marked failed: ${failCount}`);
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

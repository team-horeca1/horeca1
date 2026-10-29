/**
 * Compare Razorpay's payment status with ours.
 *
 *   npx tsx prisma/scripts/audit-razorpay-capture.ts
 *   npx tsx prisma/scripts/audit-razorpay-capture.ts --apply
 *
 * Default is read-only. --apply captures payments Razorpay still has as
 * authorized, and sets order paymentStatus to refunded when Razorpay already
 * refunded a payment we had marked paid. It does not cancel or rewind
 * fulfillment — goods may already have moved.
 *
 * Wallet repayments that are SUCCESS while Razorpay is not captured are
 * printed for ops. --apply captures a still-authorized repayment. It does not
 * reverse credit that was already applied on a refunded repayment.
 */
import 'dotenv/config';
import { prisma } from '../../src/lib/prisma';
import { getRazorpay } from '../../src/lib/razorpay';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { creditWalletService } from '../../src/modules/credit/creditWallet.service';
import { ensurePaymentCaptured, auditApplyRequested, auditMutation } from '../../src/lib/razorpayCapture';

const APPLY = auditApplyRequested(process.argv);

interface GatewayPayment {
  id: string;
  status: string;
  amount: number | string;
}

const paymentService = new PaymentService();

function paise(amount: number | string): number {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Math.round(n);
}

async function fetchGateway(paymentId: string): Promise<GatewayPayment | null> {
  try {
    return await getRazorpay().payments.fetch(paymentId) as GatewayPayment;
  } catch (err) {
    console.error(`  fetch failed for ${paymentId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function auditOrders() {
  const rows = await prisma.payment.findMany({
    where: { razorpayPaymentId: { not: null } },
    include: {
      order: { select: { orderNumber: true, paymentStatus: true, status: true } },
    },
  });

  const byGatewayId = new Map<string, typeof rows>();
  for (const row of rows) {
    const id = row.razorpayPaymentId;
    if (!id) continue;
    const list = byGatewayId.get(id) ?? [];
    list.push(row);
    byGatewayId.set(id, list);
  }

  const flagged: string[] = [];
  console.log(`\nOrders: ${byGatewayId.size} Razorpay payment(s), ${rows.length} payment row(s).`);

  for (const [gatewayId, group] of byGatewayId) {
    const gateway = await fetchGateway(gatewayId);
    if (!gateway) continue;
    const orderNumbers = group.map((g) => g.order.orderNumber).join(', ');
    const ourPayment = group.map((g) => g.status).join('/');
    const ourOrder = group.map((g) => `${g.order.orderNumber}:${g.order.paymentStatus}/${g.order.status}`).join(', ');
    const paidButNotCaptured = group.some((g) => g.order.paymentStatus === 'paid' && gateway.status !== 'captured');
    const line = `${orderNumbers}  razorpay=${gateway.status}  payment=${ourPayment}  order=${ourOrder}`;

    if (paidButNotCaptured || gateway.status === 'authorized' || gateway.status === 'refunded') {
      console.log(`  FLAG  ${line}`);
      if (paidButNotCaptured) flagged.push(`${orderNumbers} (${gateway.status})`);
    }

    const action = auditMutation(gateway.status, APPLY);
    if (action === 'none') continue;

    const expectedPaise = Math.round(group.reduce((sum, g) => sum + Number(g.amount), 0) * 100);
    try {
      if (action === 'capture') {
        const captured = await ensurePaymentCaptured(gatewayId, expectedPaise);
        if (group.some((g) => g.status !== 'captured') && group[0].razorpayOrderId) {
          await paymentService.settleCapturedCheckout({
            razorpayOrderId: group[0].razorpayOrderId,
            razorpayPaymentId: captured.id,
            method: captured.method,
          });
        }
        console.log(`  APPLY captured ${gatewayId} for ${orderNumbers}`);
      } else if (action === 'mark_refunded') {
        await paymentService.recordGatewayRefund(gatewayId, paise(gateway.amount));
        console.log(`  APPLY marked refunded ${gatewayId} for ${orderNumbers} (fulfillment unchanged)`);
      }
    } catch (err) {
      console.error(`  APPLY failed for ${orderNumbers}:`, err instanceof Error ? err.message : err);
    }
  }

  const paidWithoutId = await prisma.payment.findMany({
    where: {
      razorpayPaymentId: null,
      order: { paymentStatus: 'paid', paymentMethod: 'online' },
    },
    include: { order: { select: { orderNumber: true } } },
  });
  for (const row of paidWithoutId) {
    const text = `${row.order.orderNumber} paid in our DB with no Razorpay payment id`;
    console.log(`  FLAG  ${text}`);
    flagged.push(text);
  }

  console.log(flagged.length
    ? `\nOrders marked paid whose Razorpay payment is not captured (${flagged.length}):\n  ${flagged.join('\n  ')}`
    : '\nNo paid orders disagreed with a captured Razorpay payment.');
}

async function auditWallets() {
  const rows = await prisma.creditWalletRepayment.findMany({
    where: { razorpayPaymentId: { not: null } },
  });
  console.log(`\nWallet repayments with a Razorpay payment id: ${rows.length}.`);
  for (const row of rows) {
    const gatewayId = row.razorpayPaymentId;
    if (!gatewayId) continue;
    const gateway = await fetchGateway(gatewayId);
    if (!gateway) continue;
    if (row.status === 'SUCCESS' && gateway.status !== 'captured') {
      console.log(`  FLAG  repayment ${row.id} status=${row.status} razorpay=${gateway.status} amount=${row.amount}`);
    }
    if (auditMutation(gateway.status, APPLY) !== 'capture') continue;
    try {
      const expectedPaise = Math.round(Number(row.amount) * 100);
      await ensurePaymentCaptured(gatewayId, expectedPaise);
      if (row.status === 'PENDING') {
        await creditWalletService.applyRepayment(
          row.walletId,
          Number(row.amount),
          'RAZORPAY',
          row.razorpayOrderId ?? undefined,
          gatewayId,
        );
      }
      console.log(`  APPLY captured wallet repayment ${row.id}`);
    } catch (err) {
      console.error(`  APPLY failed for repayment ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function main() {
  console.log(APPLY ? 'APPLY mode — will capture and update refunded orders.' : 'Read-only. Pass --apply to capture survivors and mark refunds.');
  await auditOrders();
  await auditWallets();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

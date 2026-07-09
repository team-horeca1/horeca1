import { prisma } from '@/lib/prisma';
import { getRazorpay } from '@/lib/razorpay';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';
import { orderService } from '@/modules/order/order.service';
import crypto from 'crypto';

function timingSafeEqHex(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'utf8'), Buffer.from(providedHex, 'utf8'));
}

// Narrow helper — the Razorpay webhook payload shape we care about
interface RazorpayWebhookPaymentEntity {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  method?: string;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: RazorpayWebhookPaymentEntity;
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
      };
    };
  };
}

function isWebhookPayload(value: unknown): value is RazorpayWebhookPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['event'] === 'string' && typeof v['payload'] === 'object' && v['payload'] !== null;
}

export class PaymentService {
  /**
   * Create a single Razorpay order that covers one or more horeca orders (POs).
   *
   * Why: when a customer pays for multiple vendor POs in one checkout, we still
   * keep them as separate horeca Order rows (so each vendor sees their own PO,
   * gets their own GST invoice, can be refunded independently). But we open ONE
   * Razorpay popup for the combined amount instead of N popups in a loop.
   *
   * Implementation: create ONE razorpayOrder for the summed amount, then write
   * one Payment row per horeca order — all sharing the same razorpayOrderId. On
   * verify/webhook, we resolve all rows by razorpayOrderId and mark every linked
   * order paid in a single transaction.
   */
  async initiate(orderIds: string[], userId: string) {
    if (orderIds.length === 0) throw Errors.badRequest('No orders to pay for');

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, userId },
    });
    if (orders.length !== orderIds.length) {
      throw Errors.notFound('Order');
    }

    for (const o of orders) {
      if (o.status === 'cancelled') {
        throw Errors.badRequest(`Order ${o.orderNumber} is cancelled`);
      }
      if (o.paymentStatus === 'paid') {
        throw Errors.badRequest(`Order ${o.orderNumber} is already paid`);
      }
      if (o.paymentMethod !== 'online') {
        throw Errors.badRequest(`Order ${o.orderNumber} is not an online payment order`);
      }
    }

    // Reuse an open Razorpay order if all selected POs already share one.
    const existing = await prisma.payment.findMany({
      where: {
        orderId: { in: orderIds },
        userId,
        status: 'created',
        razorpayOrderId: { not: null },
      },
      select: { razorpayOrderId: true, orderId: true },
    });
    if (
      existing.length === orderIds.length
      && existing.every((p) => p.razorpayOrderId === existing[0].razorpayOrderId)
      && existing[0].razorpayOrderId
    ) {
      const rzId = existing[0].razorpayOrderId;
      const totalAmount = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
      return {
        razorpay_order_id: rzId,
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        key_id: process.env.RAZORPAY_KEY_ID,
      };
    }

    const totalAmount = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const receipt = orders.length === 1
      ? orders[0].orderNumber
      : `multi-${orders[0].orderNumber}-${orders.length}`;

    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt,
    });

    // One Payment row per horeca order — all linked to the same razorpayOrderId.
    await prisma.payment.createMany({
      data: orders.map(o => ({
        orderId: o.id,
        vendorId: o.vendorId,
        userId,
        razorpayOrderId: razorpayOrder.id,
        amount: o.totalAmount,
        status: 'created' as const,
      })),
    });

    return {
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    };
  }

  async verify(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    userId: string,
  ) {
    // Verify signature
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    if (!timingSafeEqHex(expectedSignature, razorpaySignature)) {
      throw Errors.unauthorized('Invalid payment signature');
    }

    // A single Razorpay order can map to multiple horeca Payment/Order rows
    // (multi-PO combined checkout). Mark every linked row paid atomically.
    const payments = await prisma.payment.findMany({
      where: { razorpayOrderId },
    });
    if (payments.length === 0) throw Errors.notFound('Payment');
    if (!payments.every((p) => p.userId === userId)) {
      throw Errors.forbidden('Payment does not belong to this account');
    }

    // Idempotency: already captured by a prior verify or webhook
    if (payments.every((p) => p.status === 'captured')) {
      return { success: true, payment_status: 'captured', orders_paid: payments.length, alreadyCaptured: true };
    }

    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { razorpayOrderId, status: { not: 'captured' } },
        data: { razorpayPaymentId, razorpaySignature, status: 'captured' },
      }),
      prisma.order.updateMany({
        where: { id: { in: payments.map((p) => p.orderId) }, status: { not: 'cancelled' } },
        data: { paymentStatus: 'paid' },
      }),
      prisma.order.updateMany({
        where: { id: { in: payments.map((p) => p.orderId) }, status: 'pending' },
        data: { status: 'confirmed' },
      }),
    ]);

    for (const payment of payments) {
      if (payment.status === 'captured') continue;
      emitEvent('PaymentReceived', {
        orderId: payment.orderId,
        paymentId: payment.id,
        userId: payment.userId,
        vendorId: payment.vendorId,
        amount: Number(payment.amount),
      });
      emitEvent('OrderConfirmed', {
        orderId: payment.orderId,
        userId: payment.userId,
        vendorId: payment.vendorId,
      });
    }

    return { success: true, payment_status: 'captured', orders_paid: payments.length };
  }

  // handleWebhook — called by the unauthenticated POST /api/v1/payments/webhook route.
  // Razorpay fires this server-to-server so payments are captured even if the user
  // closed the browser before /verify was called.
  //
  // WHY separate RAZORPAY_WEBHOOK_SECRET:
  //   The webhook secret is set in the Razorpay dashboard and is different from the
  //   API key secret. Using the wrong secret would let anyone forge events.
  async handleWebhook(rawBody: string, signature: string): Promise<{ processed: boolean; event: string }> {
    // 1. Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeEqHex(expectedSig, signature)) {
      throw Errors.unauthorized('Invalid webhook signature');
    }

    // 2. Parse and narrow the body
    const parsed: unknown = JSON.parse(rawBody);
    if (!isWebhookPayload(parsed)) {
      // Unrecognised shape — ack with 200 so Razorpay stops retrying
      return { processed: false, event: 'unknown' };
    }

    const { event, payload } = parsed;

    // 2b. Idempotency — Razorpay can replay the same event (network glitch on
    // their side, our 200 took >5s, etc.). Insert into a unique index keyed by
    // ${event}:${entityId}; duplicate insert means we already processed it and
    // we should ack without redoing the side effects.
    const dedupId = (() => {
      if (event.startsWith('payment.')) return `${event}:${payload.payment?.entity?.id ?? ''}`;
      if (event.startsWith('refund.')) return `${event}:${payload.refund?.entity?.id ?? ''}`;
      return '';
    })();
    if (dedupId && dedupId.endsWith(':')) {
      // Couldn't extract an entity id — skip dedup and let the caller decide
    } else if (dedupId) {
      try {
        await prisma.webhookEvent.create({
          data: { provider: 'razorpay', providerEventId: dedupId, event },
        });
      } catch (err) {
        // P2002 = unique constraint violation = we've seen this event before
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
          return { processed: true, event };
        }
        throw err;
      }
    }

    // 3. Handle payment.captured
    if (event === 'payment.captured') {
      const entity = payload.payment?.entity;
      if (!entity) return { processed: false, event };

      // A combined-checkout Razorpay order maps to multiple Payment rows.
      const payments = await prisma.payment.findMany({
        where: { razorpayOrderId: entity.order_id },
      });

      if (payments.length === 0) {
        // No matching payment records — ack silently
        return { processed: false, event };
      }

      // Idempotency: already captured by /verify or a prior webhook delivery
      if (payments.every(p => p.status === 'captured')) {
        return { processed: true, event };
      }

      // Amount check — webhook is signed but the signature attests to the payload,
      // not to "this is for OUR order". Reject if Razorpay says they captured a
      // different amount than we charged. Razorpay sends amount in paise.
      const expectedPaise = Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100);
      if (entity.amount !== expectedPaise) {
        console.error(`[webhook] amount mismatch on ${entity.order_id}: expected ${expectedPaise} paise, got ${entity.amount}`);
        return { processed: false, event };
      }

      await prisma.$transaction([
        prisma.payment.updateMany({
          where: { razorpayOrderId: entity.order_id },
          data: {
            razorpayPaymentId: entity.id,
            status: 'captured',
            method: entity.method ?? null,
          },
        }),
        // paymentStatus reflects reality even when the order moved on; the
        // workflow status only advances from 'pending' — a late capture must
        // not resurrect a cancelled order or rewind one already in fulfilment.
        prisma.order.updateMany({
          where: { id: { in: payments.map(p => p.orderId) }, status: { not: 'cancelled' } },
          data: { paymentStatus: 'paid' },
        }),
        prisma.order.updateMany({
          where: { id: { in: payments.map(p => p.orderId) }, status: 'pending' },
          data: { status: 'confirmed' },
        }),
      ]);

      for (const payment of payments) {
        emitEvent('PaymentReceived', {
          orderId: payment.orderId,
          paymentId: payment.id,
          userId: payment.userId,
          vendorId: payment.vendorId,
          amount: Number(payment.amount),
        });

        emitEvent('OrderConfirmed', {
          orderId: payment.orderId,
          userId: payment.userId,
          vendorId: payment.vendorId,
        });
      }

      return { processed: true, event };
    }

    // 4. Handle payment.failed — mark payment failed AND cancel unpaid pending
    // orders so reserved stock is released (same path as customer abandon).
    if (event === 'payment.failed') {
      const entity = payload.payment?.entity;
      if (!entity) return { processed: false, event };

      const result = await this.failUnpaidCheckout(
        entity.order_id,
        'Payment failed via Razorpay webhook',
      );
      return { processed: result.processed, event };
    }

    // 5. Handle refund.processed
    if (event === 'refund.processed') {
      const refundEntity = payload.refund?.entity;
      if (!refundEntity) return { processed: false, event };

      // Find the payment by razorpay payment id stored at capture time
      const payment = await prisma.payment.findFirst({
        where: { razorpayPaymentId: refundEntity.payment_id },
      });

      if (!payment) return { processed: false, event };

      // Sanity check: refund amount can't exceed what we actually charged.
      // Anything beyond is either a Razorpay bug or a forged event for a payment_id
      // we happen to know — refuse either way. Razorpay sends amount in paise.
      const maxPaise = Math.round(Number(payment.amount) * 100);
      const refundPaise = Number((refundEntity as { amount?: number }).amount ?? 0);
      if (refundPaise <= 0 || refundPaise > maxPaise) {
        console.error(`[webhook] refund amount mismatch on payment ${payment.id}: max ${maxPaise} paise, got ${refundPaise}`);
        return { processed: false, event };
      }

      // Mark as refunded if not already
      if (payment.status !== 'refunded') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'refunded' },
        });
      }

      return { processed: true, event };
    }

    // Unhandled event type — ack with 200 so Razorpay stops retrying
    return { processed: false, event };
  }

  /**
   * Customer dismissed Razorpay (or verify failed client-side). Ownership-checked.
   * Cancels unpaid pending online orders and releases reserved stock.
   */
  async abandon(razorpayOrderId: string, userId: string) {
    const payments = await prisma.payment.findMany({ where: { razorpayOrderId } });
    if (payments.length === 0) throw Errors.notFound('Payment');
    if (!payments.every((p) => p.userId === userId)) {
      throw Errors.forbidden('Payment does not belong to this account');
    }
    if (payments.every((p) => p.status === 'captured')) {
      throw Errors.badRequest('Payment already captured — cannot abandon');
    }
    return this.failUnpaidCheckout(razorpayOrderId, 'Payment cancelled by customer');
  }

  /**
   * Mark linked payments failed and cancel unpaid pending online orders.
   * Idempotent. Used by abandon API, payment.failed webhook, and reconciliation.
   */
  async failUnpaidCheckout(razorpayOrderId: string, reason: string) {
    const payments = await prisma.payment.findMany({ where: { razorpayOrderId } });
    if (payments.length === 0) return { processed: false, cancelled: 0 };

    // Already fully settled — nothing to roll back
    if (payments.every((p) => p.status === 'captured')) {
      return { processed: true, cancelled: 0, alreadyCaptured: true as const };
    }

    const alreadyFailed = payments.every((p) => p.status === 'failed' || p.status === 'captured');

    if (!alreadyFailed) {
      await prisma.payment.updateMany({
        where: { razorpayOrderId, status: { notIn: ['captured', 'failed'] } },
        data: { status: 'failed' },
      });
    }

    let cancelled = 0;
    for (const payment of payments) {
      if (payment.status === 'captured') continue;
      const order = await prisma.order.findUnique({
        where: { id: payment.orderId },
        select: {
          id: true,
          vendorId: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
        },
      });
      if (!order) continue;
      if (order.paymentStatus === 'paid') continue;
      if (order.paymentMethod !== 'online') continue;
      if (order.status !== 'pending') continue;

      await orderService.updateStatus(
        order.id,
        order.vendorId,
        'cancelled',
        reason,
      );
      cancelled++;
    }

    if (!alreadyFailed) {
      for (const payment of payments) {
        if (payment.status === 'captured') continue;
        emitEvent('PaymentFailed', {
          orderId: payment.orderId,
          userId: payment.userId,
          vendorId: payment.vendorId,
          reason,
        });
      }
    }

    return { processed: true, cancelled, alreadyFailed };
  }
}

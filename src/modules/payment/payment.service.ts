import { prisma } from '@/lib/prisma';
import { getRazorpay } from '@/lib/razorpay';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';
import { orderService } from '@/modules/order/order.service';
import { canInitiateRazorpay } from '@/lib/offlinePayment';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import {
  CapturePendingError,
  PaymentNotCapturedError,
  ensurePaymentCaptured,
  razorpayOrderCaptureFields,
} from '@/lib/razorpayCapture';
import crypto from 'crypto';

function timingSafeEqHex(expectedHex?: string | null, providedHex?: string | null): boolean {
  if (!expectedHex || !providedHex || expectedHex.length !== providedHex.length) return false;
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

    const resumedIds: string[] = [];
    try {
    for (const o of orders) {
      if (o.status === 'cancelled') {
        throw Errors.badRequest(`Order ${o.orderNumber} is cancelled`);
      }
      if (o.paymentStatus === 'paid') {
        throw Errors.badRequest(`Order ${o.orderNumber} is already paid`);
      }
      if (!canInitiateRazorpay(o.paymentMethod)) {
        throw Errors.badRequest(`Order ${o.orderNumber} cannot be paid online`);
      }
      if (o.abandonedAt) {
        await orderService.resumeAbandonedOrder(o.id);
        resumedIds.push(o.id);
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

    // `offers: []` is valid on Orders API but missing from razorpay@2.9.6 types.
    // Empty list suppresses Offers Engine partner cashback (Cred etc.) that fails
    // Test Mode with "Offers-engine external offer not found".
    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt,
      offers: [],
      ...razorpayOrderCaptureFields(),
    } as Parameters<ReturnType<typeof getRazorpay>['orders']['create']>[0]);

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
    } catch (err) {
      for (const id of resumedIds) {
        try {
          await orderService.markPaymentAbandoned(id, 'Payment could not be started');
        } catch (rollbackErr) {
          console.error('[Payment] Could not return order to abandoned after a failed pay start:', rollbackErr);
        }
      }
      throw err;
    }
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
    // (multi-PO combined checkout). Mark every linked row paid only after
    // Razorpay reports the payment as captured.
    const payments = await prisma.payment.findMany({
      where: { razorpayOrderId },
    });
    if (payments.length === 0) throw Errors.notFound('Payment');
    if (!payments.every((p) => p.userId === userId)) {
      throw Errors.forbidden('Payment does not belong to this account');
    }

    // A previous verify may have stored captured. Re-read Razorpay before
    // treating that as success: a later refund must not stay "paid".
    if (payments.every((p) => p.status === 'captured')) {
      const expectedPaise = Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100);
      try {
        await ensurePaymentCaptured(razorpayPaymentId, expectedPaise);
      } catch (err) {
        if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded') {
          await this.recordGatewayRefund(razorpayPaymentId, expectedPaise);
          throw Errors.paymentNotCaptured(err.message);
        }
        throw err instanceof CapturePendingError ? Errors.capturePending() : err;
      }
      try {
        const { promotionService } = await import('@/modules/promotion/promotion.service');
        await promotionService.onOrdersBecameSuccessful(payments.map((p) => p.orderId));
      } catch (err) {
        console.error('[Payment] Program issuance on already-captured verify failed:', err);
      }
      return { success: true, payment_status: 'captured', orders_paid: payments.length, alreadyCaptured: true };
    }

    for (const payment of payments) {
      if (payment.status === 'captured') continue;
      try {
        await orderService.resumeAbandonedOrder(payment.orderId);
      } catch (err) {
        console.error('[Payment] Could not reserve stock while resuming abandoned cart:', err);
      }
    }

    const expectedPaise = Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100);
    let method: string | null = null;
    try {
      const captured = await ensurePaymentCaptured(razorpayPaymentId, expectedPaise);
      method = captured.method;
    } catch (err) {
      if (err instanceof CapturePendingError) {
        await this.rememberAuthorized(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        throw Errors.capturePending();
      }
      if (err instanceof PaymentNotCapturedError) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId, status: { notIn: ['captured', 'refunded'] } },
          data: { razorpayPaymentId, razorpaySignature },
        });
        if (err.gatewayStatus === 'refunded') {
          await this.recordGatewayRefund(razorpayPaymentId, expectedPaise);
        } else if (err.gatewayStatus === 'failed') {
          await this.failUnpaidCheckout(razorpayOrderId, 'Payment was not captured');
        }
        throw Errors.paymentNotCaptured(err.message);
      }
      throw err;
    }

    return this.settleCapturedCheckout({
      razorpayOrderId,
      razorpayPaymentId,
      method,
      razorpaySignature,
    });
  }

  /**
   * Persist a Razorpay capture. Caller must already have confirmed Razorpay
   * status is `captured` for this amount. Does not change fulfillment of
   * orders that have moved past `pending`.
   */
  async settleCapturedCheckout(opts: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    method?: string | null;
    razorpaySignature?: string | null;
  }) {
    const payments = await prisma.payment.findMany({
      where: { razorpayOrderId: opts.razorpayOrderId },
    });
    if (payments.length === 0) return { success: true as const, payment_status: 'captured' as const, orders_paid: 0, missing: true as const };

    for (const payment of payments) {
      if (payment.status === 'captured') continue;
      try {
        await orderService.resumeAbandonedOrder(payment.orderId);
      } catch (err) {
        console.error('[Payment] Could not reserve stock while resuming abandoned cart:', err);
      }
    }

    const open = payments.filter((p) => p.status !== 'captured' && p.status !== 'refunded');
    if (open.length === 0) {
      return {
        success: true as const,
        payment_status: 'captured' as const,
        orders_paid: payments.filter((p) => p.status === 'captured').length,
        alreadyCaptured: true as const,
      };
    }

    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { id: { in: open.map((p) => p.id) }, status: { notIn: ['captured', 'refunded'] } },
        data: {
          razorpayPaymentId: opts.razorpayPaymentId,
          ...(opts.razorpaySignature ? { razorpaySignature: opts.razorpaySignature } : {}),
          ...(opts.method ? { method: opts.method } : {}),
          status: 'captured',
        },
      }),
      prisma.order.updateMany({
        where: { id: { in: open.map((p) => p.orderId) }, status: { not: 'cancelled' } },
        data: { paymentStatus: 'paid', paymentMethod: 'online', abandonedAt: null },
      }),
      prisma.order.updateMany({
        where: { id: { in: open.map((p) => p.orderId) }, status: 'pending' },
        data: { status: 'confirmed', abandonedAt: null },
      }),
    ]);

    for (const payment of open) {
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

    try {
      const { promotionService } = await import('@/modules/promotion/promotion.service');
      await promotionService.onOrdersBecameSuccessful(open.map((p) => p.orderId));
    } catch (err) {
      console.error('[Payment] Program issuance after capture failed:', err);
    }

    return { success: true as const, payment_status: 'captured' as const, orders_paid: open.length };
  }

  /** Keep the payment id without marking the order paid. Reconciliation retries capture. */
  async rememberAuthorized(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature?: string | null,
  ) {
    await prisma.payment.updateMany({
      where: { razorpayOrderId, status: { notIn: ['captured', 'refunded'] } },
      data: {
        razorpayPaymentId,
        ...(razorpaySignature ? { razorpaySignature } : {}),
        status: 'authorized',
      },
    });
  }

  /**
   * Full Razorpay refund of a payment we know. Marks every linked Payment
   * refunded. Orders that were already `paid` get paymentStatus `refunded`
   * and keep their fulfillment status. Orders that were never paid release
   * reserved stock.
   */
  async recordGatewayRefund(razorpayPaymentId: string, refundPaise: number) {
    const payments = await prisma.payment.findMany({
      where: { razorpayPaymentId },
    });
    if (payments.length === 0) return { processed: false as const, orderIds: [] as string[] };

    const maxPaise = Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100);
    if (refundPaise <= 0 || refundPaise > maxPaise) {
      console.error(`[Payment] refund amount mismatch on ${razorpayPaymentId}: max ${maxPaise} paise, got ${refundPaise}`);
      return { processed: false as const, orderIds: [] as string[] };
    }
    if (refundPaise !== maxPaise) {
      console.error(`[Payment] partial refund ${refundPaise}/${maxPaise} paise on ${razorpayPaymentId} — order payment status left unchanged`);
      return { processed: false as const, orderIds: [] as string[] };
    }

    await prisma.payment.updateMany({
      where: { id: { in: payments.map((p) => p.id) }, status: { not: 'refunded' } },
      data: { status: 'refunded' },
    });

    const stillCaptured = await prisma.payment.findMany({
      where: { orderId: { in: payments.map((p) => p.orderId) }, status: 'captured' },
      select: { orderId: true },
    });
    const still = new Set(stillCaptured.map((p) => p.orderId));
    const finished = payments.filter((p) => !still.has(p.orderId));
    const paidOrderIds = finished.map((p) => p.orderId);

    if (paidOrderIds.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: paidOrderIds }, paymentStatus: 'paid' },
        data: { paymentStatus: 'refunded' },
      });
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: finished.map((p) => p.orderId) } },
      select: { id: true, status: true, paymentStatus: true, paymentMethod: true },
    });
    const orderById = new Map(orders.map((o) => [o.id, o]));

    for (const payment of finished) {
      const order = orderById.get(payment.orderId);
      if (
        order
        && order.paymentStatus !== 'paid'
        && order.paymentStatus !== 'refunded'
        && order.paymentMethod === 'online'
        && order.status === 'pending'
      ) {
        try {
          await orderService.markPaymentAbandoned(order.id, 'Payment refunded before it was captured');
        } catch (err) {
          console.error('[Payment] Could not release stock after gateway refund:', err);
        }
      }

      if (payment.status === 'refunded') continue;

      emitEvent('PaymentRefunded', {
        orderId: payment.orderId,
        paymentId: payment.id,
        userId: payment.userId,
        vendorId: payment.vendorId,
        amount: Number(payment.amount),
        reason: 'Razorpay refunded this payment',
      });
      await logAction(null, null, {
        action: AUDIT_ACTIONS.paymentRefunded,
        entity: 'order',
        entityId: payment.orderId,
        metadata: {
          paymentId: payment.id,
          razorpayPaymentId,
          refundPaise,
        },
      });
    }

    return { processed: true as const, orderIds: finished.map((p) => p.orderId) };
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

    // 3. payment.authorized — manual capture (or the 12-minute auto window) leaves
    // the payment here. Capture it, then mark paid only if Razorpay confirms.
    if (event === 'payment.authorized') {
      const entity = payload.payment?.entity;
      if (!entity) return { processed: false, event };
      const settled = await this.captureAuthorizedEntity(entity);
      return { processed: settled, event };
    }

    // 4. payment.captured — the payload can be stale. Fetch the live payment
    // before marking paid. A refunded payment must not be written back to paid.
    if (event === 'payment.captured') {
      const entity = payload.payment?.entity;
      if (!entity) return { processed: false, event };

      const payments = await prisma.payment.findMany({
        where: { razorpayOrderId: entity.order_id },
      });
      if (payments.length === 0) return { processed: false, event };
      if (payments.every((p) => p.status === 'refunded')) return { processed: true, event };

      const expectedPaise = Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100);
      try {
        const captured = await ensurePaymentCaptured(entity.id, expectedPaise);
        await this.settleCapturedCheckout({
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: captured.id,
          method: captured.method ?? entity.method ?? null,
        });
        return { processed: true, event };
      } catch (err) {
        if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded') {
          await this.recordGatewayRefund(entity.id, expectedPaise);
        } else {
          console.error('[Payment] captured webhook did not confirm capture:', err);
        }
        return { processed: false, event };
      }
    }

    // 5. Handle payment.failed — mark payment failed and park the order as an
    // abandoned cart (stock released, not cancelled) so sales can call.
    if (event === 'payment.failed') {
      const entity = payload.payment?.entity;
      if (!entity) return { processed: false, event };

      const result = await this.failUnpaidCheckout(
        entity.order_id,
        'Payment failed via Razorpay webhook',
      );
      return { processed: result.processed, event };
    }

    // 6. Handle refund.processed — payment status and, when the order was
    // already marked paid, order.paymentStatus. Fulfillment status stays.
    if (event === 'refund.processed') {
      const refundEntity = payload.refund?.entity;
      if (!refundEntity) return { processed: false, event };

      const refundPaise = Number((refundEntity as { amount?: number }).amount ?? 0);
      const result = await this.recordGatewayRefund(refundEntity.payment_id, refundPaise);
      return { processed: result.processed, event };
    }

    // Unhandled event type — ack with 200 so Razorpay stops retrying
    return { processed: false, event };
  }

  /** Capture an authorized Razorpay payment and settle the checkout when it sticks. */
  private async captureAuthorizedEntity(entity: RazorpayWebhookPaymentEntity): Promise<boolean> {
    const payments = await prisma.payment.findMany({
      where: { razorpayOrderId: entity.order_id },
    });
    if (payments.length === 0) return false;

    const expectedPaise = Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100);
    if (payments.every((p) => p.status === 'refunded')) return false;

    try {
      const captured = await ensurePaymentCaptured(entity.id, expectedPaise);
      await this.settleCapturedCheckout({
        razorpayOrderId: entity.order_id,
        razorpayPaymentId: captured.id,
        method: captured.method ?? entity.method ?? null,
      });
      return true;
    } catch (err) {
      if (err instanceof CapturePendingError) {
        await this.rememberAuthorized(entity.order_id, entity.id);
        return false;
      }
      if (err instanceof PaymentNotCapturedError && err.gatewayStatus === 'refunded') {
        await this.recordGatewayRefund(entity.id, expectedPaise);
      }
      console.error('[Payment] authorized webhook did not capture:', err);
      return false;
    }
  }

  /**
   * Customer dismissed Razorpay (or verify failed client-side). Ownership-checked.
   * Parks unpaid pending online orders as abandoned carts and releases stock.
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
   * Mark linked payments failed and park unpaid pending online orders as
   * abandoned carts. Idempotent. Used by abandon API, payment.failed webhook,
   * and reconciliation. Does not cancel the order.
   */
  async failUnpaidCheckout(razorpayOrderId: string, reason: string) {
    const payments = await prisma.payment.findMany({ where: { razorpayOrderId } });
    if (payments.length === 0) return { processed: false, cancelled: 0 };

    // Already fully settled — nothing to roll back. An authorized payment is
    // still collectable; failing it here is how uncaptured money gets refunded.
    if (payments.every((p) => p.status === 'captured' || p.status === 'authorized')) {
      return { processed: true, cancelled: 0, alreadyCaptured: payments.every((p) => p.status === 'captured') };
    }

    const alreadyFailed = payments.every((p) => p.status === 'failed' || p.status === 'captured' || p.status === 'authorized' || p.status === 'refunded');

    if (!alreadyFailed) {
      await prisma.payment.updateMany({
        where: { razorpayOrderId, status: { notIn: ['captured', 'failed', 'authorized', 'refunded'] } },
        data: { status: 'failed' },
      });
    }

    let abandoned = 0;
    for (const payment of payments) {
      if (payment.status === 'captured' || payment.status === 'authorized' || payment.status === 'refunded') continue;
      const order = await prisma.order.findUnique({
        where: { id: payment.orderId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          abandonedAt: true,
        },
      });
      if (!order) continue;
      if (order.paymentStatus === 'paid') continue;
      if (order.paymentMethod !== 'online') continue;
      if (order.status !== 'pending') continue;

      const result = await orderService.markPaymentAbandoned(order.id, reason);
      if (result.abandoned) abandoned++;
    }

    if (!alreadyFailed) {
      for (const payment of payments) {
        if (payment.status === 'captured' || payment.status === 'authorized' || payment.status === 'refunded') continue;
        emitEvent('PaymentFailed', {
          orderId: payment.orderId,
          userId: payment.userId,
          vendorId: payment.vendorId,
          reason,
        });
      }
    }

    return { processed: true, cancelled: abandoned, abandoned, alreadyFailed };
  }
}

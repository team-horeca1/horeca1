import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const paymentFindMany = vi.fn();
const paymentUpdateMany = vi.fn();
const paymentCreateMany = vi.fn();
const orderFindMany = vi.fn();
const orderUpdateMany = vi.fn();
const orderFindUnique = vi.fn();
const webhookEventCreate = vi.fn();
const transaction = vi.fn();
const resumeAbandonedOrder = vi.fn();
const markPaymentAbandoned = vi.fn();
const paymentsFetch = vi.fn();
const paymentsCapture = vi.fn();
const ordersFetchPayments = vi.fn();
const ordersCreate = vi.fn();
const walletRepaymentFindMany = vi.fn();
const walletRepaymentFindFirst = vi.fn();
const applyRepayment = vi.fn();
const reverseRepayment = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: {
      findMany: (...args: unknown[]) => paymentFindMany(...args),
      updateMany: (...args: unknown[]) => paymentUpdateMany(...args),
      createMany: (...args: unknown[]) => paymentCreateMany(...args),
      update: vi.fn(),
    },
    order: {
      findMany: (...args: unknown[]) => orderFindMany(...args),
      updateMany: (...args: unknown[]) => orderUpdateMany(...args),
      findUnique: (...args: unknown[]) => orderFindUnique(...args),
    },
    webhookEvent: { create: (...args: unknown[]) => webhookEventCreate(...args) },
    creditWalletRepayment: {
      findMany: (...args: unknown[]) => walletRepaymentFindMany(...args),
      findFirst: (...args: unknown[]) => walletRepaymentFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

const paymentsFetchMultipleRefund = vi.fn();

vi.mock('@/lib/razorpay', () => ({
  getRazorpay: () => ({
    payments: {
      fetch: (...args: unknown[]) => paymentsFetch(...args),
      capture: (...args: unknown[]) => paymentsCapture(...args),
      fetchMultipleRefund: (...args: unknown[]) => paymentsFetchMultipleRefund(...args),
    },
    orders: {
      fetchPayments: (...args: unknown[]) => ordersFetchPayments(...args),
      create: (...args: unknown[]) => ordersCreate(...args),
    },
  }),
}));

vi.mock('@/modules/order/order.service', () => ({
  orderService: {
    resumeAbandonedOrder: (...args: unknown[]) => resumeAbandonedOrder(...args),
    markPaymentAbandoned: (...args: unknown[]) => markPaymentAbandoned(...args),
  },
}));

vi.mock('@/events/emitter', () => ({ emitEvent: vi.fn() }));

vi.mock('@/lib/auditLog', () => ({
  AUDIT_ACTIONS: { paymentRefunded: 'payment.refunded' },
  logAction: vi.fn(),
}));

vi.mock('@/modules/promotion/promotion.service', () => ({
  promotionService: { onOrdersBecameSuccessful: vi.fn() },
}));

vi.mock('@/modules/credit/creditWallet.service', () => ({
  creditWalletService: {
    applyRepayment: (...args: unknown[]) => applyRepayment(...args),
    reverseRazorpayRepayment: (...args: unknown[]) => reverseRepayment(...args),
  },
}));

import { PaymentService } from '@/modules/payment/payment.service';
import { reconcilePayments } from '@/workers/reconciliation.worker';
import { POST as walletWebhook } from '@/app/api/v1/wallet/razorpay-webhook/route';
import { NextRequest } from 'next/server';
import {
  auditApplyRequested,
  auditMutation,
  razorpayOrderCaptureFields,
  razorpayOrderOfferFields,
  RAZORPAY_AUTOMATIC_EXPIRY_MINUTES,
  RAZORPAY_MANUAL_EXPIRY_MINUTES,
} from '@/lib/razorpayCapture';
import { shouldAbandonAfterVerifyFailure } from '@/lib/razorpayClient';

const ORDER_ID = 'order_rz';
const PAYMENT_ID = 'pay_rz';
const SECRET = 'test_secret';

function checkoutPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-row',
    orderId: 'order-1',
    vendorId: 'vendor-1',
    userId: 'user-1',
    razorpayOrderId: ORDER_ID,
    razorpayPaymentId: null as string | null,
    amount: 1000,
    status: 'created',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    ...overrides,
  };
}

function sign(orderId = ORDER_ID, paymentId = PAYMENT_ID) {
  return crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('razorpay capture', () => {
  const service = new PaymentService();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
    paymentUpdateMany.mockResolvedValue({ count: 1 });
    paymentCreateMany.mockResolvedValue({ count: 1 });
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderFindMany.mockResolvedValue([]);
    orderFindUnique.mockResolvedValue(null);
    webhookEventCreate.mockResolvedValue({ id: 'wh' });
    transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
    resumeAbandonedOrder.mockResolvedValue({ resumed: false });
    markPaymentAbandoned.mockResolvedValue({ abandoned: false });
    walletRepaymentFindMany.mockResolvedValue([]);
    walletRepaymentFindFirst.mockResolvedValue(null);
    applyRepayment.mockResolvedValue(null);
    reverseRepayment.mockResolvedValue({ reversed: false, reason: 'not_applied' });
  });

  function gateway(status: string, overrides: Record<string, unknown> = {}) {
    return { id: PAYMENT_ID, status, amount: 100000, currency: 'INR', method: 'upi', ...overrides };
  }

  function webhook(event: string, payload: unknown) {
    const body = JSON.stringify({ event, payload });
    const signature = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
    return { body, signature };
  }

  it('puts automatic capture on every Razorpay order', async () => {
    expect(razorpayOrderCaptureFields()).toEqual({
      payment: {
        capture: 'automatic',
        capture_options: {
        automatic_expiry_period: RAZORPAY_AUTOMATIC_EXPIRY_MINUTES,
        manual_expiry_period: RAZORPAY_MANUAL_EXPIRY_MINUTES,
        refund_speed: 'optimum',
        },
      },
    });

    orderFindMany.mockResolvedValue([{
      id: 'order-1',
      userId: 'user-1',
      vendorId: 'vendor-1',
      orderNumber: 'H1-1',
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'online',
      totalAmount: 1000,
      abandonedAt: null,
    }]);
    paymentFindMany.mockResolvedValue([]);
    ordersCreate.mockResolvedValue({ id: ORDER_ID, amount: 100000, currency: 'INR' });

    await service.initiate(['order-1'], 'user-1');

    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100000,
      currency: 'INR',
      offers: [],
      payment: { capture: 'automatic', capture_options: expect.objectContaining({ automatic_expiry_period: 4320, manual_expiry_period: 7200, refund_speed: 'optimum' }) },
    }));
    // Partner Offers Engine only — not Horeca1 coupons/promotions.
    expect(razorpayOrderOfferFields()).toEqual({ offers: [] });
  });

  it('captures an authorized payment before marking the order paid', async () => {
    const row = checkoutPayment();
    paymentFindMany.mockResolvedValue([row]);
    paymentsFetch.mockResolvedValue(gateway('authorized'));
    paymentsCapture.mockResolvedValue(gateway('captured'));

    const result = await service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1');

    expect(paymentsCapture).toHaveBeenCalledWith(PAYMENT_ID, 100000, 'INR');
    expect(result.payment_status).toBe('captured');
    expect(orderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentStatus: 'paid' }),
    }));
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'captured', razorpayPaymentId: PAYMENT_ID }),
    }));
  });

  it('does not mark paid or abandon when capture does not complete', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch.mockResolvedValue(gateway('authorized'));
    paymentsCapture.mockRejectedValue(new Error('gateway timeout'));

    await expect(service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1')).rejects.toMatchObject({
      code: 'CAPTURE_PENDING',
    });

    expect(shouldAbandonAfterVerifyFailure('CAPTURE_PENDING')).toBe(false);
    expect(markPaymentAbandoned).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'authorized', razorpayPaymentId: PAYMENT_ID }),
    }));
  });

  it('does not mark paid when Razorpay says the payment is refunded', async () => {
    paymentFindMany.mockImplementation(async (args: { where?: { razorpayPaymentId?: string } }) => {
      if (args?.where?.razorpayPaymentId) return [checkoutPayment({ razorpayPaymentId: PAYMENT_ID, status: 'created' })];
      return [checkoutPayment()];
    });
    paymentsFetch.mockResolvedValue(gateway('refunded'));

    await expect(service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1')).rejects.toMatchObject({
      code: 'PAYMENT_NOT_CAPTURED',
    });

    const paid = orderUpdateMany.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { paymentStatus?: string } })?.data;
      return data?.paymentStatus === 'paid';
    });
    expect(paid).toHaveLength(0);
    expect(paymentsCapture).not.toHaveBeenCalled();
    expect(shouldAbandonAfterVerifyFailure('PAYMENT_NOT_CAPTURED')).toBe(false);
  });

  it('moves a paid order to paymentStatus refunded without changing fulfillment', async () => {
    paymentFindMany.mockImplementation(async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'captured') return [];
      return [checkoutPayment({ status: 'captured', razorpayPaymentId: PAYMENT_ID })];
    });
    orderFindMany.mockResolvedValue([{
      id: 'order-1',
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'online',
    }]);
    reverseRepayment.mockResolvedValue({ reversed: false, reason: 'not_applied' });

    const body = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_1', payment_id: PAYMENT_ID, amount: 100000 } } },
    });
    const signature = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
    const result = await service.handleWebhook(body, signature);

    expect(result.processed).toBe(true);
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['order-1'] }, paymentStatus: 'paid' },
      data: { paymentStatus: 'refunded' },
    });
    const fulfillmentChange = orderUpdateMany.mock.calls.some((call) => {
      const data = (call[0] as { data?: { status?: string } })?.data;
      return data?.status !== undefined;
    });
    expect(fulfillmentChange).toBe(false);
    expect(markPaymentAbandoned).not.toHaveBeenCalled();
    expect(reverseRepayment).toHaveBeenCalledWith(PAYMENT_ID, 100000, 'rfnd_1');
  });

  it('checkout refund webhook also attempts wallet ledger reverse (idempotent no-op when not a repayment)', async () => {
    paymentFindMany.mockResolvedValue([]);
    reverseRepayment.mockResolvedValue({ reversed: true, amount: 500, fullyReversed: true });
    const body = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_wallet_bridge', payment_id: 'pay_wallet', amount: 50000 } } },
    });
    const signature = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
    const result = await service.handleWebhook(body, signature);
    expect(result.processed).toBe(false);
    expect(reverseRepayment).toHaveBeenCalledWith('pay_wallet', 50000, 'rfnd_wallet_bridge');
  });

  it('reconciliation captures an authorized payment instead of failing the checkout', async () => {
    const row = checkoutPayment();
    paymentFindMany.mockResolvedValue([row]);
    ordersFetchPayments.mockResolvedValue({
      items: [{ id: PAYMENT_ID, status: 'authorized', amount: 100000, method: 'upi' }],
    });
    paymentsFetch.mockResolvedValue(gateway('authorized'));
    paymentsCapture.mockResolvedValue(gateway('captured'));

    await reconcilePayments();

    expect(paymentsCapture).toHaveBeenCalledWith(PAYMENT_ID, 100000, 'INR');
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'captured' }),
    }));
    expect(markPaymentAbandoned).not.toHaveBeenCalled();
    const failed = paymentUpdateMany.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { status?: string } })?.data;
      return data?.status === 'failed';
    });
    expect(failed).toHaveLength(0);
  });

  it('reconciliation restores wallet ledger when an applied repayment was refunded (mocked)', async () => {
    paymentFindMany.mockResolvedValue([]);
    walletRepaymentFindMany.mockImplementation(async (args: { where?: { status?: string | { in?: string[] } } }) => {
      const status = args?.where?.status;
      if (status === 'PENDING') return [];
      if (typeof status === 'object' && status.in?.includes('SUCCESS')) {
        return [{
          id: 'rep-success',
          walletId: 'wal-1',
          amount: 500,
          status: 'SUCCESS',
          razorpayPaymentId: 'pay_refunded_wallet',
          razorpayOrderId: 'order_wallet',
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        }];
      }
      return [];
    });
    paymentsFetch.mockResolvedValue({
      id: 'pay_refunded_wallet',
      status: 'refunded',
      amount: 50000,
      amount_refunded: 50000,
    });
    paymentsFetchMultipleRefund.mockResolvedValue({
      items: [{ id: 'rfnd_missed', amount: 50000, status: 'processed' }],
    });
    reverseRepayment.mockResolvedValue({ reversed: true, amount: 500, fullyReversed: true });

    await reconcilePayments();

    expect(paymentsFetchMultipleRefund).toHaveBeenCalledWith('pay_refunded_wallet');
    expect(reverseRepayment).toHaveBeenCalledWith('pay_refunded_wallet', 50000, 'rfnd_missed');
  });

  it('payment.failed does not abandon an authorized payment', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment({ status: 'authorized', razorpayPaymentId: PAYMENT_ID })]);
    const { body, signature } = webhook('payment.failed', {
      payment: { entity: { id: 'pay_failed', order_id: ORDER_ID, amount: 100000, status: 'failed' } },
    });

    const result = await service.handleWebhook(body, signature);

    expect(result.processed).toBe(true);
    expect(markPaymentAbandoned).not.toHaveBeenCalled();
    const failedWrites = paymentUpdateMany.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { status?: string } })?.data;
      return data?.status === 'failed';
    });
    expect(failedWrites).toHaveLength(0);
  });

  it('rejects a payment whose currency is not INR and does not capture it', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch.mockResolvedValue(gateway('authorized', { currency: 'USD' }));

    await expect(service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1')).rejects.toMatchObject({
      code: 'PAYMENT_NOT_CAPTURED',
    });
    expect(paymentsCapture).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('treats an already-captured Razorpay payment as success without capturing again', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch.mockResolvedValue(gateway('captured'));

    const result = await service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1');

    expect(paymentsCapture).not.toHaveBeenCalled();
    expect(result.payment_status).toBe('captured');
  });

  it('does not capture again when Razorpay says the payment was already captured', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch
      .mockResolvedValueOnce(gateway('authorized'))
      .mockResolvedValueOnce(gateway('captured'));
    paymentsCapture.mockRejectedValue(new Error('This payment has already been captured'));

    const result = await service.verify(ORDER_ID, PAYMENT_ID, sign(), 'user-1');

    expect(result.payment_status).toBe('captured');
    expect(paymentsFetch).toHaveBeenCalledTimes(2);
  });

  it('payment.authorized fetches the live payment and captures it', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch.mockResolvedValue(gateway('authorized'));
    paymentsCapture.mockResolvedValue(gateway('captured'));
    const { body, signature } = webhook('payment.authorized', {
      payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, amount: 100000, status: 'authorized' } },
    });

    const result = await service.handleWebhook(body, signature);

    expect(result).toEqual({ processed: true, event: 'payment.authorized' });
    expect(paymentsCapture).toHaveBeenCalledWith(PAYMENT_ID, 100000, 'INR');
    expect(orderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentStatus: 'paid' }),
    }));
  });

  it('payment.captured does not mark paid when the live payment is refunded', async () => {
    paymentFindMany.mockImplementation(async (args: { where?: { status?: string; razorpayPaymentId?: string } }) => {
      if (args?.where?.status === 'captured') return [];
      if (args?.where?.razorpayPaymentId) return [checkoutPayment({ razorpayPaymentId: PAYMENT_ID })];
      return [checkoutPayment()];
    });
    paymentsFetch.mockResolvedValue(gateway('refunded'));
    const { body, signature } = webhook('payment.captured', {
      payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, amount: 100000, status: 'captured' } },
    });

    const result = await service.handleWebhook(body, signature);

    expect(result.processed).toBe(false);
    const paid = orderUpdateMany.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { paymentStatus?: string } })?.data;
      return data?.paymentStatus === 'paid';
    });
    expect(paid).toHaveLength(0);
    expect(paymentsCapture).not.toHaveBeenCalled();
  });

  it('ignores a duplicate webhook delivery', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    paymentsFetch.mockResolvedValue(gateway('captured'));
    const { body, signature } = webhook('payment.captured', {
      payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, amount: 100000, status: 'captured' } },
    });
    await service.handleWebhook(body, signature);
    webhookEventCreate.mockRejectedValueOnce({ code: 'P2002' });
    orderUpdateMany.mockClear();

    const again = await service.handleWebhook(body, signature);

    expect(again).toEqual({ processed: true, event: 'payment.captured' });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('does not mark an order refunded while another captured payment still covers it', async () => {
    paymentFindMany.mockImplementation(async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'captured') return [{ orderId: 'order-1' }];
      return [checkoutPayment({ status: 'captured', razorpayPaymentId: PAYMENT_ID, amount: 400 })];
    });
    const { body, signature } = webhook('refund.processed', {
      refund: { entity: { id: 'rfnd_partial_sibling', payment_id: PAYMENT_ID, amount: 40000 } },
    });

    const result = await service.handleWebhook(body, signature);

    expect(result.processed).toBe(true);
    const refundedOrder = orderUpdateMany.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { paymentStatus?: string } })?.data;
      return data?.paymentStatus === 'refunded';
    });
    expect(refundedOrder).toHaveLength(0);
  });

  it('leaves a partial refund unpaid-status unchanged', async () => {
    paymentFindMany.mockResolvedValue([
      checkoutPayment({ status: 'captured', razorpayPaymentId: PAYMENT_ID }),
    ]);
    const { body, signature } = webhook('refund.processed', {
      refund: { entity: { id: 'rfnd_part', payment_id: PAYMENT_ID, amount: 100 } },
    });

    const result = await service.handleWebhook(body, signature);

    expect(result.processed).toBe(false);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('reconciliation does not fail a checkout when Razorpay cannot be reached', async () => {
    paymentFindMany.mockResolvedValue([checkoutPayment()]);
    ordersFetchPayments.mockRejectedValue(new Error('timeout'));

    await reconcilePayments();

    expect(markPaymentAbandoned).not.toHaveBeenCalled();
    expect(paymentsCapture).not.toHaveBeenCalled();
  });

  it('applies a wallet repayment only after Razorpay capture', async () => {
    walletRepaymentFindFirst.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: 500,
      status: 'PENDING',
      razorpayOrderId: ORDER_ID,
    });
    paymentsFetch.mockResolvedValue(gateway('authorized', { amount: 50000 }));
    paymentsCapture.mockResolvedValue(gateway('captured', { amount: 50000 }));
    const { body, signature } = webhook('payment.authorized', {
      payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, amount: 50000, status: 'authorized' } },
    });
    const req = new NextRequest('http://localhost/api/v1/wallet/razorpay-webhook', {
      method: 'POST',
      body,
      headers: { 'x-razorpay-signature': signature },
    });

    const res = await walletWebhook(req);
    expect(res.status).toBe(200);
    expect(paymentsCapture).toHaveBeenCalledWith(PAYMENT_ID, 50000, 'INR');
    expect(applyRepayment).toHaveBeenCalledTimes(1);

    applyRepayment.mockClear();
    paymentsFetch.mockResolvedValue(gateway('refunded', { amount: 50000 }));
    const refundedReq = new NextRequest('http://localhost/api/v1/wallet/razorpay-webhook', {
      method: 'POST',
      body,
      headers: { 'x-razorpay-signature': signature },
    });
    const refunded = await walletWebhook(refundedReq);
    expect(refunded.status).toBe(200);
    expect(applyRepayment).not.toHaveBeenCalled();
  });

  it('reverses wallet ledger on refund.processed (mocked signed webhook)', async () => {
    reverseRepayment.mockResolvedValue({ reversed: true, amount: 500, fullyReversed: true });
    const { body, signature } = webhook('refund.processed', {
      refund: { entity: { id: 'rfnd_wallet_1', payment_id: PAYMENT_ID, amount: 50000 } },
    });
    const req = new NextRequest('http://localhost/api/v1/wallet/razorpay-webhook', {
      method: 'POST',
      body,
      headers: { 'x-razorpay-signature': signature },
    });

    const res = await walletWebhook(req);
    expect(res.status).toBe(200);
    expect(reverseRepayment).toHaveBeenCalledWith(PAYMENT_ID, 50000, 'rfnd_wallet_1');
    expect(applyRepayment).not.toHaveBeenCalled();
  });

  it('does not reverse twice when the same refund webhook is delivered again', async () => {
    reverseRepayment.mockResolvedValue({ reversed: false, reason: 'duplicate' });
    const { body, signature } = webhook('refund.processed', {
      refund: { entity: { id: 'rfnd_dup', payment_id: PAYMENT_ID, amount: 50000 } },
    });
    const req = () =>
      new NextRequest('http://localhost/api/v1/wallet/razorpay-webhook', {
        method: 'POST',
        body,
        headers: { 'x-razorpay-signature': signature },
      });

    expect((await walletWebhook(req())).status).toBe(200);
    expect((await walletWebhook(req())).status).toBe(200);
    expect(reverseRepayment).toHaveBeenCalledTimes(2);
    expect(reverseRepayment).toHaveBeenNthCalledWith(1, PAYMENT_ID, 50000, 'rfnd_dup');
    expect(reverseRepayment).toHaveBeenNthCalledWith(2, PAYMENT_ID, 50000, 'rfnd_dup');
  });

  it('does not apply credit when a delayed payment.captured arrives after refund', async () => {
    walletRepaymentFindFirst.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: 500,
      status: 'REFUNDED',
      razorpayOrderId: ORDER_ID,
    });
    paymentsFetch.mockResolvedValue(gateway('refunded', { amount: 50000 }));
    const { body, signature } = webhook('payment.captured', {
      payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, amount: 50000, status: 'captured' } },
    });
    const req = new NextRequest('http://localhost/api/v1/wallet/razorpay-webhook', {
      method: 'POST',
      body,
      headers: { 'x-razorpay-signature': signature },
    });

    const res = await walletWebhook(req);
    expect(res.status).toBe(200);
    expect(applyRepayment).not.toHaveBeenCalled();
  });

  it('does not capture or write in the default audit mode, and never captures a refund', () => {
    expect(auditApplyRequested(['node', 'audit-razorpay-capture.ts'])).toBe(false);
    expect(auditMutation('authorized', false)).toBe('none');
    expect(auditMutation('refunded', false)).toBe('none');
    expect(auditMutation('authorized', true)).toBe('capture');
    expect(auditMutation('refunded', true)).toBe('mark_refunded');
    expect(auditMutation('captured', true)).toBe('none');
  });
});

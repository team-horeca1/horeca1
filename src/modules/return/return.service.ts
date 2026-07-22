import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { getRazorpay } from '@/lib/razorpay';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { debitVendorOnRefund } from '@/modules/vendor/vendorSettlement.service';
import { promotionService } from '@/modules/promotion/promotion.service';
import { orderService } from '@/modules/order/order.service';

export type ReturnStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'refund_processing'
  | 'refunded'
  /** Terminal for credit_note / replacement (no Razorpay refund). */
  | 'resolved';

const CREDIT_METHODS = ['credit', 'vendor_credit'];
const WALLET_METHODS = ['h1_wallet', 'wallet'];

export async function notifyReturnSubmitted(returnRequestId: string): Promise<void> {
  const req = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          userId: true,
          vendor: { select: { userId: true, businessName: true } },
        },
      },
      customer: { select: { fullName: true } },
    },
  });
  if (!req) return;

  await prisma.notification.create({
    data: {
      userId: req.order.vendor.userId,
      type: 'return_submitted',
      channel: 'in_app',
      status: 'sent',
      title: 'New return request',
      body: `${req.customer.fullName} requested a return for order ${req.order.orderNumber}`,
      referenceId: returnRequestId,
      referenceType: 'return_request',
    },
  });
}

export async function vendorReviewReturn(
  returnId: string,
  vendorId: string,
  input: {
    status: 'approved' | 'rejected';
    vendorNote?: string;
    refundAmount?: number;
    resolutionType?: 'refund' | 'credit_note' | 'replacement';
    creditNoteAmount?: number;
  },
) {
  const returnReq = await prisma.returnRequest.findFirst({
    where: { id: returnId, order: { vendorId } },
    include: {
      order: {
        select: { id: true, status: true, userId: true, paymentMethod: true },
      },
    },
  });
  if (!returnReq) throw Errors.notFound('Return request');
  if (returnReq.status !== 'pending') {
    throw Errors.badRequest(`Return is already ${returnReq.status}`);
  }

  const resolutionType = input.resolutionType ?? 'refund';
  const resolutionData: Record<string, unknown> = {};
  let nextStatus: ReturnStatus = input.status;

  if (input.status === 'approved') {
    resolutionData.resolutionType = resolutionType;
    if (resolutionType === 'credit_note') {
      resolutionData.creditNoteNumber = `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      if (input.creditNoteAmount != null) resolutionData.creditNoteAmount = input.creditNoteAmount;
      // No admin Razorpay step — close the return now.
      nextStatus = 'resolved';
    } else if (resolutionType === 'replacement') {
      nextStatus = 'resolved';
    } else if (resolutionType === 'refund' && input.refundAmount != null) {
      resolutionData.refundAmount = input.refundAmount;
    }
  }

  const updated = await prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      status: nextStatus,
      adminNote: input.vendorNote,
      ...resolutionData,
    },
  });

  if (input.status === 'approved') {
    const wallet = await prisma.creditWallet.findFirst({
      where: { userId: returnReq.order.userId, vendorId },
    });
    if (wallet && Number(wallet.outstandingAmount) > 0) {
      if (
        resolutionType === 'refund' &&
        input.refundAmount &&
        input.refundAmount > 0 &&
        returnReq.order.paymentMethod &&
        CREDIT_METHODS.includes(returnReq.order.paymentMethod)
      ) {
        const refund = Math.min(input.refundAmount, Number(wallet.outstandingAmount));
        await creditWalletService.applyRepayment(
          wallet.id,
          refund,
          'REVERSAL',
          undefined,
          undefined,
          `Return approved — credit reversal ₹${refund.toFixed(2)}`,
        );
      } else if (
        resolutionType === 'credit_note' &&
        input.creditNoteAmount &&
        input.creditNoteAmount > 0
      ) {
        const amount = Math.min(input.creditNoteAmount, Number(wallet.outstandingAmount));
        await creditWalletService.applyRepayment(
          wallet.id,
          amount,
          'CREDIT_NOTE',
          undefined,
          undefined,
          `Credit note on return ${returnId}`,
        );
      }
    }
  }

  return updated;
}

export async function adminProcessReturnRefund(
  returnId: string,
  input: {
    adminNote?: string;
    refundAmount?: number;
    adminUserId: string;
  },
): Promise<{ updated: Awaited<ReturnType<typeof prisma.returnRequest.update>>; razorpayRefundId: string | null }> {
  const existing = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          userId: true,
          paymentMethod: true,
          paymentStatus: true,
          totalAmount: true,
          walletApplied: true,
          status: true,
          payments: {
            where: { status: 'captured' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, razorpayPaymentId: true },
          },
        },
      },
    },
  });
  if (!existing) throw Errors.notFound('Return request');
  if (existing.status === 'refunded') throw Errors.badRequest('Return already refunded');
  if (existing.status === 'rejected') throw Errors.badRequest('Cannot refund a rejected return');
  if (existing.status === 'resolved') {
    throw Errors.badRequest('This return was closed with credit note / replacement — no money refund');
  }
  if (existing.status === 'pending') {
    throw Errors.badRequest('Vendor must approve the return before processing refund');
  }
  const resolution = existing.resolutionType ?? 'refund';
  if (resolution !== 'refund') {
    throw Errors.badRequest(
      `Cannot process a money refund for resolution type "${resolution}". Only refund resolutions are eligible.`,
    );
  }
  if (existing.status !== 'approved' && existing.status !== 'refund_processing') {
    throw Errors.badRequest(`Cannot refund a return in status "${existing.status}"`);
  }

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: 'refund_processing', adminNote: input.adminNote ?? existing.adminNote },
  });

  const refundAmount = input.refundAmount ?? Number(existing.refundAmount ?? existing.order.totalAmount);
  if (!(refundAmount > 0)) throw Errors.badRequest('Refund amount must be greater than zero');

  const order = existing.order;
  const capturedPayment = order.payments[0] ?? null;
  let razorpayRefundId: string | null = null;

  // Gateway refund whenever a captured Razorpay payment exists for the order.
  // Checkout stores paymentMethod 'online' (seeds may use 'razorpay'/'prepaid'), so we
  // must not gate on the method string — COD/credit/wallet orders never have a
  // captured Razorpay payment, so this check is sufficient on its own.
  const isRazorpay = !!capturedPayment?.razorpayPaymentId;
  if (isRazorpay) {
    const amountPaise = Math.round(refundAmount * 100);
    const refund = await getRazorpay().payments.refund(capturedPayment!.razorpayPaymentId!, {
      amount: amountPaise,
      notes: { returnRequestId: returnId, adminUserId: input.adminUserId },
    });
    razorpayRefundId = (refund as { id?: string }).id ?? null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.returnRequest.update({
      where: { id: returnId },
      data: {
        status: 'refunded',
        adminNote: input.adminNote ?? existing.adminNote,
        refundAmount,
      },
    });

    if (order.paymentMethod && WALLET_METHODS.includes(order.paymentMethod)) {
      await promotionService.refundWalletForOrder(tx, {
        id: order.id,
        userId: order.userId,
        walletApplied: Number(order.walletApplied),
      });
    }

    if (capturedPayment?.id && razorpayRefundId) {
      await tx.payment.update({
        where: { id: capturedPayment.id },
        data: { status: 'refunded' },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'refunded' },
    });

    return tx.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
  });

  if (order.paymentMethod && !CREDIT_METHODS.includes(order.paymentMethod)) {
    await debitVendorOnRefund(
      order.vendorId,
      order.id,
      refundAmount,
      `Return ${returnId} refunded to customer`,
    );
  }

  if (order.status !== 'returned') {
    await orderService.updateStatus(
      order.id,
      order.vendorId,
      'returned',
      `Return ${returnId} processed`,
      undefined,
      true,
    );
  }

  return { updated, razorpayRefundId };
}

export const returnService = {
  notifyReturnSubmitted,
  vendorReviewReturn,
  adminProcessReturnRefund,
};

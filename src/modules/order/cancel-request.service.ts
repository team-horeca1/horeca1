import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { OrderService } from '@/modules/order/order.service';
import { ORDER_EVENT_ACTIONS, recordOrderEvent } from '@/modules/order/order-events';

const orderService = new OrderService();

export async function createCancelRequest(orderId: string, customerId: string, reason: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: customerId },
      select: { id: true, status: true, vendorId: true, orderNumber: true, userId: true },
    });
    if (!order) throw Errors.notFound('Order');
    // Online payment moves pending → confirmed; cancel still allowed until Packed.
    if (!OrderService.isCancellableStatus(order.status)) {
      throw Errors.badRequest(
        'Cancellation can only be requested while the order is Pending or Confirmed (before packing).',
      );
    }

    const existing = await prisma.cancelRequest.findUnique({ where: { orderId } });
    if (existing) {
      if (existing.status === 'pending') {
        throw Errors.badRequest('A cancellation request is already pending for this order.');
      }
      throw Errors.badRequest(`A cancellation request already exists (${existing.status}).`);
    }

    const requestId = randomUUID();
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.cancelRequest.create({
        data: {
          id: requestId,
          orderId,
          customerId: order.userId,
          reason: reason.trim(),
          status: 'pending',
        },
      });
      await recordOrderEvent(tx, {
        orderId,
        actorId: customerId,
        action: ORDER_EVENT_ACTIONS.CANCEL_REQUESTED,
        fromStatus: order.status,
        toStatus: order.status,
        payload: { reason: reason.trim(), cancelRequestId: row.id },
      });
      return row;
    });

  // Fire-and-forget vendor in-app notification
  const vendor = await prisma.vendor.findUnique({
    where: { id: order.vendorId },
    select: { userId: true, businessName: true },
  });
  if (vendor?.userId) {
    void prisma.notification.create({
      data: {
        userId: vendor.userId,
        type: 'cancel_requested',
        channel: 'in_app',
        status: 'sent',
        title: 'Cancellation request',
        body: `Customer requested cancellation for order ${order.orderNumber}`,
        referenceId: created.id,
        referenceType: 'cancel_request',
      },
    }).catch(() => undefined);
  }

  return created;
}

export async function getCancelRequestForCustomer(orderId: string, customerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: customerId },
    select: { id: true },
  });
  if (!order) throw Errors.notFound('Order');
  return prisma.cancelRequest.findUnique({ where: { orderId } });
}

export async function listVendorCancelRequests(vendorId: string, status?: string) {
  return prisma.cancelRequest.findMany({
    where: {
      order: { vendorId },
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
}

export async function reviewCancelRequest(
  requestId: string,
  vendorId: string,
  actorId: string,
  input: { status: 'approved' | 'rejected'; vendorNote?: string },
) {
  const req = await prisma.cancelRequest.findFirst({
    where: { id: requestId, order: { vendorId } },
    include: { order: { select: { id: true, status: true, orderNumber: true, userId: true } } },
  });
  if (!req) throw Errors.notFound('Cancel request');
  if (req.status !== 'pending') {
    throw Errors.badRequest(`Cancel request is already ${req.status}`);
  }

  if (input.status === 'rejected') {
    const rejectNote = input.vendorNote?.trim() ?? '';
    if (rejectNote.length < 10) {
      throw Errors.badRequest('A note to the customer (at least 10 characters) is required when declining.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.cancelRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          vendorNote: rejectNote,
        },
      });
      await recordOrderEvent(tx, {
        orderId: req.orderId,
        actorId,
        action: ORDER_EVENT_ACTIONS.CANCEL_REJECTED,
        fromStatus: req.order.status,
        toStatus: req.order.status,
        payload: {
          cancelRequestId: requestId,
          vendorNote: rejectNote,
        },
      });
      return row;
    });

    await prisma.notification.create({
      data: {
        userId: req.order.userId,
        type: 'cancel_rejected',
        channel: 'in_app',
        status: 'sent',
        title: 'Cancellation declined',
        body: `Your cancellation request for ${req.order.orderNumber} was declined. Store note: ${rejectNote}`,
        referenceId: requestId,
        referenceType: 'cancel_request',
      },
    }).catch(() => undefined);

    return updated;
  }

  // Approve → cancel order (must still be before packing)
  if (!OrderService.isCancellableStatus(req.order.status)) {
    throw Errors.badRequest('Order is already being packed or beyond; cancellation cannot be approved.');
  }

  const reason = `Customer cancel request approved${input.vendorNote?.trim() ? `: ${input.vendorNote.trim()}` : ''}`;
  await orderService.updateStatus(
    req.orderId,
    vendorId,
    'cancelled',
    reason,
    undefined,
    false,
    actorId,
  );

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.cancelRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        vendorNote: input.vendorNote?.trim() || null,
      },
    });
    await recordOrderEvent(tx, {
      orderId: req.orderId,
      actorId,
      action: ORDER_EVENT_ACTIONS.CANCEL_APPROVED,
      fromStatus: req.order.status,
      toStatus: 'cancelled',
      payload: {
        cancelRequestId: requestId,
        vendorNote: input.vendorNote?.trim() || null,
      },
    });
    return row;
  });

  await prisma.notification.create({
    data: {
      userId: req.order.userId,
      type: 'cancel_approved',
      channel: 'in_app',
      status: 'sent',
      title: 'Order cancelled',
      body: `Your cancellation request for ${req.order.orderNumber} was approved.`,
      referenceId: requestId,
      referenceType: 'cancel_request',
    },
  }).catch(() => undefined);

  return updated;
}

export const cancelRequestService = {
  createCancelRequest,
  getCancelRequestForCustomer,
  listVendorCancelRequests,
  reviewCancelRequest,
};

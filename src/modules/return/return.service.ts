import { randomUUID } from 'crypto';
import {
  Prisma,
  type ReturnDisposition as PrismaReturnDisposition,
  type ReturnItemDecision as PrismaReturnItemDecision,
  type ReturnItemReason as PrismaReturnItemReason,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { getRazorpay } from '@/lib/razorpay';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { debitVendorOnRefund } from '@/modules/vendor/vendorSettlement.service';
import { promotionService } from '@/modules/promotion/promotion.service';
import { orderService } from '@/modules/order/order.service';
import type { OrderService } from '@/modules/order/order.service';
import {
  RETURN_DISPOSITIONS,
  RETURN_EVENT_ACTIONS,
  mapLegacyReturnStatus,
  type ReturnActionBody,
  type ReturnDisposition,
  type ReturnStatus,
  type ReturnType as ReturnRequestType,
} from '@/modules/return/return.types';

const CREDIT_METHODS = ['credit', 'vendor_credit'];
const WALLET_METHODS = ['h1_wallet', 'wallet'];

type Db = Prisma.TransactionClient | typeof prisma;

type ListFilters = {
  status?: ReturnStatus;
  type?: ReturnRequestType;
  outletId?: string;
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
};

type CustomerCreateInput = {
  reason: string;
  type?: ReturnRequestType;
  items?: Array<{
    orderItemId: string;
    quantity: number;
    reason: PrismaReturnItemReason;
    note?: string;
  }>;
};

const DETAIL_INCLUDE = {
  items: {
    include: {
      orderItem: {
        select: {
          id: true,
          productId: true,
          productName: true,
          productSku: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          hsn: true,
          packSize: true,
          taxPercent: true,
          product: { select: { imageUrl: true, sku: true, unit: true } },
        },
      },
    },
  },
  events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  inspection: true,
  customer: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      businessName: true,
    },
  },
  replacementOrder: {
    select: { id: true, orderNumber: true, status: true, totalAmount: true },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      subtotal: true,
      deliveredAt: true,
      outletId: true,
      fulfillmentOutletId: true,
      vendorId: true,
      userId: true,
      outlet: { select: { id: true, name: true } },
      user: {
        select: {
          id: true,
          fullName: true,
          businessName: true,
          phone: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.ReturnRequestInclude;

const LIST_INCLUDE = {
  customer: {
    select: {
      id: true,
      fullName: true,
      email: true,
      businessName: true,
      phone: true,
    },
  },
  items: { select: { id: true, decision: true, requestedQty: true, approvedQty: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      vendorId: true,
      outletId: true,
      status: true,
      paymentMethod: true,
      outlet: { select: { id: true, name: true } },
      user: {
        select: { id: true, fullName: true, businessName: true, phone: true },
      },
    },
  },
} satisfies Prisma.ReturnRequestInclude;

function assertStatus(current: string, allowed: ReturnStatus[], action: string) {
  const normalized = mapLegacyReturnStatus(current);
  if (!allowed.includes(normalized)) {
    throw Errors.badRequest(
      `Cannot ${action} while return is "${current}". Allowed: ${allowed.join(', ')}.`,
    );
  }
}

function dispositionBucket(
  disposition: ReturnDisposition,
): 'qtyAvailable' | 'qtyDamaged' | 'qtyReturned' {
  switch (disposition) {
    case 'saleable':
      return 'qtyAvailable';
    case 'damaged':
    case 'expired':
    case 'scrap':
      return 'qtyDamaged';
    case 'return_to_brand':
    case 'qa_hold':
      return 'qtyReturned';
    default: {
      const _exhaustive: never = disposition;
      void _exhaustive;
      return 'qtyReturned';
    }
  }
}

async function appendReturnEvent(
  db: Db,
  input: {
    returnRequestId: string;
    actorId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    payload?: Record<string, unknown> | null;
  },
) {
  return db.returnEvent.create({
    data: {
      id: randomUUID(),
      returnRequestId: input.returnRequestId,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

function computeApprovedGoodsValue(
  items: Array<{
    decision: string;
    approvedQty: number | null;
    requestedQty: number;
    orderItem: { unitPrice: Prisma.Decimal | number };
  }>,
): number {
  let total = 0;
  for (const item of items) {
    if (item.decision !== 'approved' && item.decision !== 'partial') continue;
    const qty = item.approvedQty ?? item.requestedQty;
    total += Number(item.orderItem.unitPrice) * qty;
  }
  return Math.round(total * 100) / 100;
}

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

export async function notifyReturnReviewed(returnRequestId: string): Promise<void> {
  const req = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      order: { select: { orderNumber: true, userId: true } },
    },
  });
  if (!req) return;

  const note = req.adminNote?.trim();
  let title = 'Return update';
  let body = `Your return request for ${req.order.orderNumber} was updated.`;
  const status = mapLegacyReturnStatus(req.status);

  if (status === 'rejected' || req.status === 'rejected') {
    title = 'Return rejected';
    body = note
      ? `Your return request for ${req.order.orderNumber} was rejected. Store note: ${note}`
      : `Your return request for ${req.order.orderNumber} was rejected.`;
  } else if (status === 'approved' || req.status === 'approved') {
    title = 'Return approved';
    body = note
      ? `Your return for ${req.order.orderNumber} was approved. Refund will be processed by HoReCa1. Store note: ${note}`
      : `Your return for ${req.order.orderNumber} was approved. Refund will be processed by HoReCa1.`;
  } else if (req.status === 'resolved' || status === 'closed') {
    const kind = req.resolutionType === 'credit_note' ? 'credit note' : 'replacement';
    title = 'Return resolved';
    body = note
      ? `Your return for ${req.order.orderNumber} was resolved via ${kind}. Store note: ${note}`
      : `Your return for ${req.order.orderNumber} was resolved via ${kind}.`;
  }

  await prisma.notification
    .create({
      data: {
        userId: req.order.userId,
        type: `return_${req.status}`,
        channel: 'in_app',
        status: 'sent',
        title,
        body,
        referenceId: returnRequestId,
        referenceType: 'return_request',
      },
    })
    .catch(() => undefined);
}

/** Legacy vendor approve/reject — kept for PATCH /vendor/returns/:id. */
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
        select: { id: true, status: true, userId: true, paymentMethod: true, orderNumber: true },
      },
    },
  });
  if (!returnReq) throw Errors.notFound('Return request');
  // S9: 'new' replaces legacy 'pending' (migrated in returns_workspace_v2).
  if (
    returnReq.status !== 'pending' &&
    returnReq.status !== 'new' &&
    returnReq.status !== 'under_review'
  ) {
    throw Errors.badRequest(`Return is already ${returnReq.status}`);
  }

  const noteTrimmed = input.vendorNote?.trim() ?? '';
  if (input.status === 'rejected' && noteTrimmed.length < 10) {
    throw Errors.badRequest(
      'A note to the customer (at least 10 characters) is required when rejecting.',
    );
  }

  const resolutionType = input.resolutionType ?? 'refund';
  const resolutionData: Record<string, unknown> = {};
  let nextStatus: string = input.status;

  if (input.status === 'approved') {
    resolutionData.resolutionType = resolutionType;
    if (resolutionType === 'credit_note') {
      resolutionData.creditNoteNumber = `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      if (input.creditNoteAmount != null) resolutionData.creditNoteAmount = input.creditNoteAmount;
      // Legacy path: close immediately. S9 workspace uses generate_credit_note + close.
      nextStatus = 'closed';
    } else if (resolutionType === 'replacement') {
      nextStatus = 'closed';
    } else if (resolutionType === 'refund' && input.refundAmount != null) {
      resolutionData.refundAmount = input.refundAmount;
    }
  }

  const updated = await prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      status: nextStatus,
      adminNote: noteTrimmed || null,
      ...resolutionData,
    },
  });

  await appendReturnEvent(prisma, {
    returnRequestId: returnId,
    action:
      input.status === 'rejected'
        ? RETURN_EVENT_ACTIONS.REJECTED
        : RETURN_EVENT_ACTIONS.APPROVED,
    fromStatus: returnReq.status,
    toStatus: nextStatus,
    payload: {
      resolutionType: input.status === 'approved' ? resolutionType : undefined,
      via: 'legacy_patch',
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
        const cnAmount = Math.min(input.creditNoteAmount, Number(wallet.outstandingAmount));
        await creditWalletService.applyRepayment(
          wallet.id,
          cnAmount,
          'CREDIT_NOTE',
          undefined,
          undefined,
          `Credit note on return ${returnId}`,
        );
      }
    }
  }

  void notifyReturnReviewed(returnId);

  return updated;
}

export async function adminProcessReturnRefund(
  returnId: string,
  input: {
    adminNote?: string;
    refundAmount?: number;
    adminUserId: string;
  },
): Promise<{
  updated: Awaited<ReturnType<typeof prisma.returnRequest.update>>;
  razorpayRefundId: string | null;
}> {
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
  if (existing.status === 'refunded' || existing.status === 'closed') {
    throw Errors.badRequest('Return already refunded');
  }
  if (existing.status === 'rejected') throw Errors.badRequest('Cannot refund a rejected return');
  if (existing.status === 'resolved') {
    throw Errors.badRequest(
      'This return was closed with credit note / replacement — no money refund',
    );
  }
  if (
    existing.status === 'pending' ||
    existing.status === 'new' ||
    existing.status === 'under_review'
  ) {
    throw Errors.badRequest('Vendor must approve the return before processing refund');
  }
  const resolution = existing.resolutionType ?? 'refund';
  if (resolution !== 'refund') {
    throw Errors.badRequest(
      `Cannot process a money refund for resolution type "${resolution}". Only refund resolutions are eligible.`,
    );
  }
  // S9 statuses after approval that still allow admin refund
  const refundable = new Set([
    'approved',
    'refund_processing',
    'pickup_scheduled',
    'goods_received',
    'inspection_completed',
  ]);
  if (!refundable.has(existing.status)) {
    throw Errors.badRequest(`Cannot refund a return in status "${existing.status}"`);
  }

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: 'refund_processing', adminNote: input.adminNote ?? existing.adminNote },
  });

  const refundAmount =
    input.refundAmount ?? Number(existing.refundAmount ?? existing.order.totalAmount);
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
        status: 'closed',
        adminNote: input.adminNote ?? existing.adminNote,
        refundAmount,
        resolutionType: 'refund',
      },
    });

    await appendReturnEvent(tx, {
      returnRequestId: returnId,
      actorId: input.adminUserId,
      action: RETURN_EVENT_ACTIONS.REFUND_PROCESSED,
      fromStatus: existing.status,
      toStatus: 'closed',
      payload: { refundAmount, razorpayRefundId },
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

/**
 * Returns Workspace (S9) service — list/detail + action dispatcher.
 * Legacy vendorReviewReturn / adminProcessReturnRefund remain for existing routes.
 */
export class ReturnService {
  /**
   * Lazy dynamic import — avoids OrderService TDZ if return ↔ order cycle appears.
   */
  private _orderService: OrderService | null = null;
  private async getOrderService(): Promise<OrderService> {
    if (!this._orderService) {
      const mod = await import('@/modules/order/order.service');
      this._orderService = new mod.OrderService();
    }
    return this._orderService;
  }

  async createForOrder(orderId: string, customerId: string, input: CustomerCreateInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: customerId },
      include: { items: true },
    });
    if (!order) throw Errors.notFound('Order');
    if (order.status !== 'delivered') {
      throw Errors.badRequest('Returns can only be requested for delivered orders');
    }

    const open = await prisma.returnRequest.findFirst({
      where: {
        orderId,
        status: { notIn: ['rejected', 'closed'] },
      },
    });
    if (open) throw Errors.badRequest('A return request already exists for this order');

    const type = input.type ?? 'return';
    let lineCreates: Array<{
      id: string;
      orderItemId: string;
      requestedQty: number;
      reason: PrismaReturnItemReason;
      note: string | null;
    }> = [];

    if (input.items && input.items.length > 0) {
      const itemMap = new Map(order.items.map((i) => [i.id, i]));
      for (const line of input.items) {
        const oi = itemMap.get(line.orderItemId);
        if (!oi) throw Errors.badRequest(`Order item ${line.orderItemId} not on this order`);
        const maxQty = Math.max(0, oi.quantity - (oi.cancelledQty ?? 0));
        if (line.quantity > maxQty) {
          throw Errors.badRequest(
            `Requested qty ${line.quantity} exceeds available ${maxQty} for "${oi.productName}"`,
          );
        }
        lineCreates.push({
          id: randomUUID(),
          orderItemId: line.orderItemId,
          requestedQty: line.quantity,
          reason: line.reason,
          note: line.note?.trim() || null,
        });
      }
    } else {
      // Whole-order fallback: one line per accepted order item.
      lineCreates = order.items
        .map((oi) => {
          const qty = Math.max(0, oi.quantity - (oi.cancelledQty ?? 0));
          if (qty <= 0) return null;
          return {
            id: randomUUID(),
            orderItemId: oi.id,
            requestedQty: qty,
            reason: 'other' as PrismaReturnItemReason,
            note: null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    if (lineCreates.length === 0) {
      throw Errors.badRequest('No returnable items on this order');
    }

    const created = await prisma.returnRequest.create({
      data: {
        id: randomUUID(),
        orderId,
        customerId,
        reason: input.reason.trim(),
        invoiceNumber: order.orderNumber,
        type,
        status: 'new',
        items: { create: lineCreates },
        events: {
          create: {
            id: randomUUID(),
            actorId: customerId,
            action: RETURN_EVENT_ACTIONS.CREATED,
            toStatus: 'new',
            payload: {
              type,
              itemCount: lineCreates.length,
              invoiceNumber: order.orderNumber,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    void notifyReturnSubmitted(created.id);
    return created;
  }

  async list(vendorId: string, filters: ListFilters = {}) {
    const limit = filters.limit ?? 20;
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) createdAtFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAtFilter.lte = new Date(`${filters.dateTo}T23:59:59Z`);

    const search = filters.search?.trim();
    const orderWhere: Prisma.OrderWhereInput = { vendorId };
    if (filters.outletId) orderWhere.outletId = filters.outletId;

    const where: Prisma.ReturnRequestWhereInput = {
      order: orderWhere,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { creditNoteNumber: { contains: search, mode: 'insensitive' } },
            { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
            { customer: { fullName: { contains: search, mode: 'insensitive' } } },
            { customer: { businessName: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search } } },
          ],
        },
      ];
    }

    const rows = await prisma.returnRequest.findMany({
      where,
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: LIST_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return {
      data: data.map((r) => ({
        ...r,
        status: mapLegacyReturnStatus(r.status),
      })),
      nextCursor,
      hasMore,
    };
  }

  async getById(vendorId: string, returnId: string) {
    const row = await prisma.returnRequest.findFirst({
      where: { id: returnId, order: { vendorId } },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw Errors.notFound('Return request');
    return { ...row, status: mapLegacyReturnStatus(row.status) };
  }

  async dispatchAction(
    vendorId: string,
    returnId: string,
    body: ReturnActionBody,
    actorId?: string | null,
  ) {
    switch (body.action) {
      case 'approve':
        return this.approve(vendorId, returnId, body, actorId);
      case 'partial_approve':
        return this.partialApprove(vendorId, returnId, body, actorId);
      case 'reject':
        return this.reject(vendorId, returnId, body, actorId);
      case 'schedule_pickup':
        return this.schedulePickup(vendorId, returnId, body, actorId);
      case 'mark_goods_received':
        return this.markGoodsReceived(vendorId, returnId, body, actorId);
      case 'complete_inspection':
        return this.completeInspection(vendorId, returnId, body, actorId);
      case 'reject_goods':
        return this.rejectGoods(vendorId, returnId, body, actorId);
      case 'set_disposition':
        return this.setDisposition(vendorId, returnId, body, actorId);
      case 'generate_replacement':
        return this.generateReplacement(vendorId, returnId, body, actorId);
      case 'generate_credit_note':
        return this.generateCreditNote(vendorId, returnId, body, actorId);
      case 'process_refund':
        return this.processRefund(vendorId, returnId, body, actorId);
      case 'close':
        return this.close(vendorId, returnId, body, actorId);
      default: {
        const _exhaustive: never = body;
        void _exhaustive;
        throw Errors.badRequest('Unknown return action');
      }
    }
  }

  private async loadForVendor(vendorId: string, returnId: string) {
    const row = await prisma.returnRequest.findFirst({
      where: { id: returnId, order: { vendorId } },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                productId: true,
                productName: true,
                unitPrice: true,
                quantity: true,
                cancelledQty: true,
              },
            },
          },
        },
        inspection: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            vendorId: true,
            userId: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            totalAmount: true,
            walletApplied: true,
            outletId: true,
            fulfillmentOutletId: true,
            businessAccountId: true,
            deliveryAddressSnapshot: true,
            salespersonId: true,
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Return request');
    return row;
  }

  private async applyLineDecisions(
    db: Db,
    returnId: string,
    existingItems: Array<{
      id: string;
      requestedQty: number;
      decision: PrismaReturnItemDecision;
    }>,
    decisions: Array<{
      returnItemId: string;
      decision: Exclude<PrismaReturnItemDecision, 'pending'>;
      approvedQty?: number;
      note?: string;
    }>,
  ) {
    const byId = new Map(existingItems.map((i) => [i.id, i]));
    for (const d of decisions) {
      const item = byId.get(d.returnItemId);
      if (!item) throw Errors.badRequest(`Return item ${d.returnItemId} not found`);
      let approvedQty: number | null = null;
      if (d.decision === 'approved') {
        approvedQty = d.approvedQty ?? item.requestedQty;
      } else if (d.decision === 'partial') {
        if (d.approvedQty == null || d.approvedQty <= 0) {
          throw Errors.badRequest('partial decision requires approvedQty > 0');
        }
        if (d.approvedQty >= item.requestedQty) {
          throw Errors.badRequest('partial approvedQty must be less than requestedQty');
        }
        approvedQty = d.approvedQty;
      } else {
        approvedQty = 0;
      }
      if (approvedQty != null && approvedQty > item.requestedQty) {
        throw Errors.badRequest('approvedQty cannot exceed requestedQty');
      }
      await db.returnItem.update({
        where: { id: item.id },
        data: {
          decision: d.decision,
          approvedQty,
          ...(d.note !== undefined ? { note: d.note } : {}),
        },
      });
    }
  }

  private async approve(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'approve' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['new', 'under_review'], 'approve');

    await prisma.$transaction(async (tx) => {
      if (body.items?.length) {
        await this.applyLineDecisions(tx, returnId, ret.items, body.items);
      } else if (ret.items.length > 0) {
        for (const item of ret.items) {
          await tx.returnItem.update({
            where: { id: item.id },
            data: { decision: 'approved', approvedQty: item.requestedQty },
          });
        }
      }

      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'approved',
          adminNote: body.adminNote?.trim() || ret.adminNote,
          resolutionType: ret.resolutionType ?? (ret.type === 'replacement' ? 'replacement' : 'refund'),
        },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.APPROVED,
        fromStatus: ret.status,
        toStatus: 'approved',
        payload: { adminNote: body.adminNote ?? null },
      });
    });

    void notifyReturnReviewed(returnId);
    return this.getById(vendorId, returnId);
  }

  private async partialApprove(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'partial_approve' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['new', 'under_review'], 'partial_approve');
    if (!ret.items.length) {
      throw Errors.badRequest('Return has no line items to partially approve');
    }

    await prisma.$transaction(async (tx) => {
      await this.applyLineDecisions(tx, returnId, ret.items, body.items);

      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'approved',
          adminNote: body.adminNote?.trim() || ret.adminNote,
          resolutionType: ret.resolutionType ?? 'refund',
        },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.PARTIAL_APPROVED,
        fromStatus: ret.status,
        toStatus: 'approved',
        payload: { decisions: body.items },
      });
    });

    void notifyReturnReviewed(returnId);
    return this.getById(vendorId, returnId);
  }

  private async reject(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'reject' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['new', 'under_review'], 'reject');
    const note = (body.adminNote ?? body.reason).trim();

    await prisma.$transaction(async (tx) => {
      for (const item of ret.items) {
        await tx.returnItem.update({
          where: { id: item.id },
          data: { decision: 'rejected', approvedQty: 0 },
        });
      }
      await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: 'rejected', adminNote: note },
      });
      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.REJECTED,
        fromStatus: ret.status,
        toStatus: 'rejected',
        payload: { reason: body.reason },
      });
    });

    void notifyReturnReviewed(returnId);
    return this.getById(vendorId, returnId);
  }

  private async schedulePickup(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'schedule_pickup' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['approved'], 'schedule_pickup');
    const pickupAt = new Date(body.pickupAt);
    if (Number.isNaN(pickupAt.getTime())) throw Errors.badRequest('Invalid pickupAt');

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'pickup_scheduled',
          pickupAt,
          pickupAddress: body.pickupAddress?.trim() || ret.pickupAddress,
          pickupNotes: body.notes?.trim() || ret.pickupNotes,
        },
      });
      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.PICKUP_SCHEDULED,
        fromStatus: ret.status,
        toStatus: 'pickup_scheduled',
        payload: {
          pickupAt: pickupAt.toISOString(),
          pickupAddress: body.pickupAddress ?? null,
          notes: body.notes ?? null,
        },
      });
    });

    return this.getById(vendorId, returnId);
  }

  private async markGoodsReceived(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'mark_goods_received' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['pickup_scheduled', 'approved'], 'mark_goods_received');
    const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw Errors.badRequest('Invalid receivedAt');

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'goods_received',
          goodsReceivedAt: receivedAt,
          pickupNotes: body.notes?.trim() || ret.pickupNotes,
        },
      });
      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.GOODS_RECEIVED,
        fromStatus: ret.status,
        toStatus: 'goods_received',
        payload: { receivedAt: receivedAt.toISOString(), notes: body.notes ?? null },
      });
    });

    return this.getById(vendorId, returnId);
  }

  private async completeInspection(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'complete_inspection' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['goods_received'], 'complete_inspection');
    const verifiedBy = body.verifiedBy ?? actorId ?? null;
    const verifiedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.returnInspection.upsert({
        where: { returnRequestId: returnId },
        create: {
          id: randomUUID(),
          returnRequestId: returnId,
          passed: body.passed,
          notes: body.notes?.trim() || null,
          verifiedBy,
          verifiedAt,
        },
        update: {
          passed: body.passed,
          notes: body.notes?.trim() || null,
          verifiedBy,
          verifiedAt,
        },
      });

      await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: 'inspection_completed' },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.INSPECTION_COMPLETED,
        fromStatus: ret.status,
        toStatus: 'inspection_completed',
        payload: { passed: body.passed, notes: body.notes ?? null, verifiedBy },
      });
    });

    return this.getById(vendorId, returnId);
  }

  private async rejectGoods(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'reject_goods' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['goods_received', 'inspection_completed'], 'reject_goods');

    await prisma.$transaction(async (tx) => {
      await tx.returnInspection.upsert({
        where: { returnRequestId: returnId },
        create: {
          id: randomUUID(),
          returnRequestId: returnId,
          passed: false,
          notes: body.notes?.trim() || body.reason,
          verifiedBy: actorId ?? null,
          verifiedAt: new Date(),
        },
        update: {
          passed: false,
          notes: body.notes?.trim() || body.reason,
          verifiedBy: actorId ?? null,
          verifiedAt: new Date(),
        },
      });

      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'rejected',
          adminNote: body.reason.trim(),
        },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.GOODS_REJECTED,
        fromStatus: ret.status,
        toStatus: 'rejected',
        payload: { reason: body.reason, notes: body.notes ?? null },
      });
    });

    void notifyReturnReviewed(returnId);
    return this.getById(vendorId, returnId);
  }

  private async setDisposition(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'set_disposition' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(ret.status, ['inspection_completed'], 'set_disposition');
    if (ret.inspection && ret.inspection.passed === false) {
      throw Errors.badRequest('Cannot set disposition after failed inspection — reject goods instead');
    }

    const outletId = ret.order.fulfillmentOutletId ?? ret.order.outletId;
    if (!outletId) throw Errors.badRequest('Order has no fulfillment outlet for inventory');

    const itemMap = new Map(ret.items.map((i) => [i.id, i]));

    await prisma.$transaction(async (tx) => {
      for (const row of body.items) {
        const item = itemMap.get(row.returnItemId);
        if (!item) throw Errors.badRequest(`Return item ${row.returnItemId} not found`);
        if (item.decision !== 'approved' && item.decision !== 'partial') {
          throw Errors.badRequest(
            `Cannot set disposition on ${item.decision} line "${item.orderItem.productName}"`,
          );
        }
        if (item.disposition) {
          throw Errors.badRequest(
            `Disposition already set for "${item.orderItem.productName}" — inventory already applied`,
          );
        }
        if (!(RETURN_DISPOSITIONS as readonly string[]).includes(row.disposition)) {
          throw Errors.badRequest(`Invalid disposition "${row.disposition}"`);
        }

        const qty = item.approvedQty ?? item.requestedQty;
        if (qty <= 0) continue;

        await tx.returnItem.update({
          where: { id: item.id },
          data: { disposition: row.disposition as PrismaReturnDisposition },
        });

        await this.applyDispositionInventory(tx, {
          productId: item.orderItem.productId,
          vendorId,
          outletId,
          qty,
          disposition: row.disposition,
          actorId,
          returnId,
        });
      }

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.DISPOSITION_SET,
        fromStatus: ret.status,
        toStatus: ret.status,
        payload: { items: body.items },
      });
    });

    return this.getById(vendorId, returnId);
  }

  /** Map disposition → inventory bucket (saleable → available, etc.). */
  private async applyDispositionInventory(
    tx: Prisma.TransactionClient,
    opts: {
      productId: string;
      vendorId: string;
      outletId: string;
      qty: number;
      disposition: ReturnDisposition;
      actorId?: string | null;
      returnId: string;
    },
  ) {
    const bucket = dispositionBucket(opts.disposition);
    const inv = await tx.inventory.findUnique({
      where: {
        productId_outletId: { productId: opts.productId, outletId: opts.outletId },
      },
    });

    if (!inv || inv.vendorId !== opts.vendorId) {
      // Soft-skip missing inventory rows — disposition still recorded on return item.
      return;
    }

    const reason = `return_disposition:${opts.disposition}:${opts.returnId}`;
    const data: Prisma.InventoryUpdateInput = {};
    const oldVal = inv[bucket];
    const newVal = oldVal + opts.qty;
    data[bucket] = newVal;

    // Always bump qtyReturned as a received-return counter when not already that bucket.
    if (bucket !== 'qtyReturned') {
      data.qtyReturned = inv.qtyReturned + opts.qty;
    }

    await tx.inventory.update({
      where: { id: inv.id },
      data,
    });

    await tx.inventoryLog.create({
      data: {
        inventoryId: inv.id,
        vendorId: opts.vendorId,
        field: bucket,
        oldValue: oldVal,
        newValue: newVal,
        reason,
        changedBy: opts.actorId ?? undefined,
      },
    });

    if (bucket !== 'qtyReturned') {
      await tx.inventoryLog.create({
        data: {
          inventoryId: inv.id,
          vendorId: opts.vendorId,
          field: 'qtyReturned',
          oldValue: inv.qtyReturned,
          newValue: inv.qtyReturned + opts.qty,
          reason,
          changedBy: opts.actorId ?? undefined,
        },
      });
    }
  }

  private async generateReplacement(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'generate_replacement' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(
      ret.status,
      ['approved', 'pickup_scheduled', 'goods_received', 'inspection_completed'],
      'generate_replacement',
    );
    if (ret.replacementOrderId) {
      throw Errors.badRequest('Replacement order already generated for this return');
    }

    const lines =
      body.items ??
      ret.items
        .filter((i) => i.decision === 'approved' || i.decision === 'partial')
        .map((i) => ({
          returnItemId: i.id,
          quantity: i.approvedQty ?? i.requestedQty,
        }))
        .filter((l) => l.quantity > 0);

    if (!lines.length) {
      throw Errors.badRequest('No approved lines to generate a replacement for');
    }

    const orderServiceInstance = await this.getOrderService();
    const replacement = await orderServiceInstance.createReplacementOrder({
      returnId,
      vendorId,
      actorId: actorId ?? null,
      notes: body.notes,
      items: lines,
    });

    await appendReturnEvent(prisma, {
      returnRequestId: returnId,
      actorId,
      action: RETURN_EVENT_ACTIONS.REPLACEMENT_GENERATED,
      fromStatus: ret.status,
      toStatus: ret.status,
      payload: {
        replacementOrderId: replacement.id,
        orderNumber: replacement.orderNumber,
        notes: body.notes ?? null,
      },
    });

    await prisma.returnRequest.update({
      where: { id: returnId },
      data: { resolutionType: 'replacement' },
    });

    return this.getById(vendorId, returnId);
  }

  private async generateCreditNote(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'generate_credit_note' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(
      ret.status,
      ['approved', 'pickup_scheduled', 'goods_received', 'inspection_completed'],
      'generate_credit_note',
    );
    if (ret.creditNoteNumber) {
      throw Errors.badRequest('Credit note already generated');
    }

    const goodsValue = computeApprovedGoodsValue(ret.items);
    const amount =
      body.amount ??
      (goodsValue > 0 ? goodsValue : Number(ret.order.totalAmount));
    if (!(amount > 0)) throw Errors.badRequest('Credit note amount must be greater than zero');

    const creditNoteNumber = `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          resolutionType: 'credit_note',
          creditNoteNumber,
          creditNoteAmount: amount,
          adminNote: body.notes?.trim() || ret.adminNote,
        },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.CREDIT_NOTE_GENERATED,
        fromStatus: ret.status,
        toStatus: ret.status,
        payload: { creditNoteNumber, amount, notes: body.notes ?? null },
      });
    });

    const wallet = await prisma.creditWallet.findFirst({
      where: { userId: ret.order.userId, vendorId },
    });
    if (wallet && Number(wallet.outstandingAmount) > 0) {
      const applyAmt = Math.min(amount, Number(wallet.outstandingAmount));
      await creditWalletService.applyRepayment(
        wallet.id,
        applyAmt,
        'CREDIT_NOTE',
        undefined,
        undefined,
        `Credit note ${creditNoteNumber} on return ${returnId}`,
      );
    }

    return this.getById(vendorId, returnId);
  }

  /**
   * Vendor-side refund intent. Razorpay gateway refunds stay on admin path.
   * Credit/wallet methods apply reversal immediately; online flags amount for admin.
   */
  private async processRefund(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'process_refund' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    assertStatus(
      ret.status,
      ['approved', 'pickup_scheduled', 'goods_received', 'inspection_completed'],
      'process_refund',
    );
    if (ret.resolutionType && ret.resolutionType !== 'refund') {
      throw Errors.badRequest(
        `Cannot process refund when resolution is "${ret.resolutionType}"`,
      );
    }

    const goodsValue = computeApprovedGoodsValue(ret.items);
    const amount =
      body.amount ??
      (Number(ret.refundAmount ?? 0) > 0
        ? Number(ret.refundAmount)
        : goodsValue > 0
          ? goodsValue
          : Number(ret.order.totalAmount));
    if (!(amount > 0)) throw Errors.badRequest('Refund amount must be greater than zero');

    const method = ret.order.paymentMethod;

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          resolutionType: 'refund',
          refundAmount: amount,
          adminNote: body.notes?.trim() || ret.adminNote,
        },
      });

      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.REFUND_PROCESSED,
        fromStatus: ret.status,
        toStatus: ret.status,
        payload: {
          amount,
          notes: body.notes ?? null,
          gateway: method && !CREDIT_METHODS.includes(method) && !WALLET_METHODS.includes(method)
            ? 'pending_admin'
            : 'vendor_applied',
        },
      });
    });

    if (method && CREDIT_METHODS.includes(method)) {
      const wallet = await prisma.creditWallet.findFirst({
        where: { userId: ret.order.userId, vendorId },
      });
      if (wallet && Number(wallet.outstandingAmount) > 0) {
        const refund = Math.min(amount, Number(wallet.outstandingAmount));
        await creditWalletService.applyRepayment(
          wallet.id,
          refund,
          'REVERSAL',
          undefined,
          undefined,
          `Return ${returnId} — credit reversal ₹${refund.toFixed(2)}`,
        );
      }
    }

    return this.getById(vendorId, returnId);
  }

  private async close(
    vendorId: string,
    returnId: string,
    body: Extract<ReturnActionBody, { action: 'close' }>,
    actorId?: string | null,
  ) {
    const ret = await this.loadForVendor(vendorId, returnId);
    const closable: ReturnStatus[] = [
      'approved',
      'rejected',
      'pickup_scheduled',
      'goods_received',
      'inspection_completed',
    ];
    assertStatus(ret.status, closable, 'close');
    if (ret.status === 'rejected') {
      // Already terminal commercially — allow explicit close for workspace hygiene.
    }

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'closed',
          adminNote: body.notes?.trim() || ret.adminNote,
        },
      });
      await appendReturnEvent(tx, {
        returnRequestId: returnId,
        actorId,
        action: RETURN_EVENT_ACTIONS.CLOSED,
        fromStatus: ret.status,
        toStatus: 'closed',
        payload: { notes: body.notes ?? null },
      });
    });

    if (
      ret.order.status !== 'returned' &&
      ret.status !== 'rejected' &&
      (ret.resolutionType === 'refund' ||
        ret.resolutionType === 'credit_note' ||
        ret.resolutionType === 'replacement' ||
        ret.creditNoteNumber ||
        ret.replacementOrderId ||
        ret.refundAmount != null)
    ) {
      await (await this.getOrderService()).updateStatus(
        ret.order.id,
        vendorId,
        'returned',
        `Return ${returnId} closed`,
        undefined,
        true,
      );
    }

    return this.getById(vendorId, returnId);
  }
}

export const returnWorkspaceService = new ReturnService();

export const returnService = {
  notifyReturnSubmitted,
  notifyReturnReviewed,
  vendorReviewReturn,
  adminProcessReturnRefund,
  createForOrder: (orderId: string, customerId: string, input: CustomerCreateInput) =>
    returnWorkspaceService.createForOrder(orderId, customerId, input),
  list: (vendorId: string, filters?: ListFilters) =>
    returnWorkspaceService.list(vendorId, filters),
  getById: (vendorId: string, returnId: string) =>
    returnWorkspaceService.getById(vendorId, returnId),
  dispatchAction: (
    vendorId: string,
    returnId: string,
    body: ReturnActionBody,
    actorId?: string | null,
  ) => returnWorkspaceService.dispatchAction(vendorId, returnId, body, actorId),
};

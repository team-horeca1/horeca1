import { randomUUID } from 'crypto';
import { Prisma, type FulfilmentStatus as PrismaFulfilmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { recordOrderEvent } from '@/modules/order/order-events';
import type { OrderService } from '@/modules/order/order.service';
import {
  DELIVERY_ACCEPTED_DB_STATUSES,
  DELIVERY_PACKED_DB_STATUSES,
  dbStatusesForDeliveryUi,
  formatDeliveryFailReason,
  type DeliveryUiStatus,
} from '@/modules/fulfillment/delivery.scope';
import {
  deliveryLinkPath,
  DeliveryLinkService,
} from '@/modules/fulfillment/delivery-link.service';
import {
  DELIVERY_EVENT_KINDS,
  FULFILMENT_EVENT_ACTIONS,
  FULFILMENT_STATUSES,
  type FulfilmentActionBody,
  type FulfilmentBulkActionBody,
  type FulfilmentStatus,
} from '@/modules/fulfillment/fulfillment.types';

type Db = Prisma.TransactionClient | typeof prisma;

type ListFilters = {
  status?: DeliveryUiStatus;
  outletId?: string;
  deliveryResourceId?: string;
  paymentMethod?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
};

const DETAIL_INCLUDE = {
  items: {
    include: {
      orderItem: {
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: { select: { imageUrl: true, sku: true, unit: true } },
        },
      },
    },
  },
  events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  deliveryEvents: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  deliveryResource: {
    select: { id: true, type: true, name: true, phone: true, isActive: true },
  },
  outlet: { select: { id: true, name: true } },
  picklists: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
    select: { id: true, status: true, createdAt: true, notes: true },
  },
  dispatches: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
    select: {
      id: true,
      status: true,
      driverName: true,
      vehicleNumber: true,
      dispatchedAt: true,
      deliveredAt: true,
      deliveryResourceId: true,
    },
  },
  deliveryAccessTokens: {
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      token: true,
      deliveryBoyName: true,
      deliveryBoyPhone: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      deliveryDate: true,
      deliveryOtp: true,
      deliveryOtpExpiresAt: true,
      deliveryOtpVerifiedAt: true,
      deliveryProofType: true,
      deliveryProofUrl: true,
      deliveryNotes: true,
      deliveredAt: true,
      outletId: true,
      fulfillmentOutletId: true,
      deliveryAddressSnapshot: true,
      user: {
        select: {
          id: true,
          fullName: true,
          businessName: true,
          phone: true,
          email: true,
        },
      },
      outlet: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.FulfilmentInclude;

const LIST_INCLUDE = {
  deliveryResource: {
    select: { id: true, type: true, name: true, phone: true },
  },
  outlet: { select: { id: true, name: true } },
  deliveryAccessTokens: {
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      token: true,
      deliveryBoyName: true,
      deliveryBoyPhone: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      deliveryDate: true,
      deliveryAddressSnapshot: true,
      user: {
        select: {
          id: true,
          fullName: true,
          businessName: true,
          phone: true,
        },
      },
      outlet: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.FulfilmentInclude;

function mapMagicLink(
  tokens: Array<{
    token: string;
    deliveryBoyName: string;
    deliveryBoyPhone: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt?: Date;
  }>,
) {
  const activeToken = tokens[0] ?? null;
  if (!activeToken) return null;
  return {
    token: activeToken.token,
    path: deliveryLinkPath(activeToken.token),
    deliveryBoyName: activeToken.deliveryBoyName,
    deliveryBoyPhone: activeToken.deliveryBoyPhone,
    expiresAt: activeToken.expiresAt,
    usedAt: activeToken.usedAt,
    ...(activeToken.createdAt ? { createdAt: activeToken.createdAt } : {}),
  };
}

function assertStatus(
  current: string,
  allowed: readonly string[],
  action: string,
): asserts current is FulfilmentStatus {
  if (!allowed.includes(current)) {
    throw Errors.badRequest(
      `Cannot ${action} while fulfilment is "${current}". Allowed: ${allowed.join(', ')}.`,
    );
  }
}

/**
 * Fulfilment / Delivery Workspace service.
 * Slim Delivery actions: mark_packed → assign_and_dispatch → fail/deliver/override.
 * Pick/pack DB stages remain for legacy rows; UI maps them via delivery.scope.
 */
export class FulfilmentService {
  private readonly deliveryLinks = new DeliveryLinkService();

  /**
   * Lazy dynamic import — avoids OrderService ↔ FulfilmentService cycle
   * ("Cannot access 'OrderService' before initialization" at module load).
   */
  private _orderService: OrderService | null = null;
  private async getOrderService(): Promise<OrderService> {
    if (!this._orderService) {
      const mod = await import('@/modules/order/order.service');
      this._orderService = new mod.OrderService();
    }
    return this._orderService;
  }

  /**
   * Idempotent: create Fulfilment + FulfilmentItems for an accepted order,
   * or return the existing row. Never mutates OrderItem qty/price.
   *
   * acceptedQty = quantity − cancelledQty (commercial accepted balance).
   */
  async ensureForOrder(
    orderId: string,
    opts?: { actorId?: string | null; tx?: Prisma.TransactionClient },
  ) {
    const db: Db = opts?.tx ?? prisma;

    const existing = await db.fulfilment.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (existing) return existing;

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw Errors.notFound('Order');

    const lineItems = order.items
      .map((item) => {
        const acceptedQty = Math.max(0, item.quantity - (item.cancelledQty ?? 0));
        return { orderItemId: item.id, acceptedQty };
      })
      .filter((row) => row.acceptedQty > 0);

    // Cancelled-only orders still get a fulfilment shell (ops visibility).
    const fulfilmentNumber = `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${order.orderNumber.slice(-4)}`;

    try {
      const created = await db.fulfilment.create({
        data: {
          id: randomUUID(),
          fulfilmentNumber,
          orderId: order.id,
          vendorId: order.vendorId,
          outletId: order.fulfillmentOutletId ?? order.outletId,
          status: 'awaiting_picking',
          items: {
            create: lineItems.map((row) => ({
              id: randomUUID(),
              orderItemId: row.orderItemId,
              acceptedQty: row.acceptedQty,
              pickedQty: 0,
              packedQty: 0,
            })),
          },
          events: {
            create: {
              id: randomUUID(),
              actorId: opts?.actorId ?? null,
              action: FULFILMENT_EVENT_ACTIONS.CREATED,
              toStatus: 'awaiting_picking',
              payload: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                itemCount: lineItems.length,
              } as Prisma.InputJsonValue,
            },
          },
        },
        include: { items: true },
      });
      return created;
    } catch (err) {
      // Concurrent ensureForOrder (unique on orderId) — return winner.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await db.fulfilment.findUnique({
          where: { orderId },
          include: { items: true },
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  async list(vendorId: string, filters: ListFilters = {}) {
    const limit = filters.limit ?? 20;
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) createdAtFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAtFilter.lte = new Date(`${filters.dateTo}T23:59:59Z`);

    const search = filters.search?.trim();
    const orderFilter: Prisma.OrderWhereInput = {};
    if (filters.paymentMethod) orderFilter.paymentMethod = filters.paymentMethod;

    const where: Prisma.FulfilmentWhereInput = {
      vendorId,
      ...(filters.status
        ? {
            status: {
              in: dbStatusesForDeliveryUi(filters.status) as PrismaFulfilmentStatus[],
            },
          }
        : {}),
      ...(filters.outletId ? { outletId: filters.outletId } : {}),
      ...(filters.deliveryResourceId
        ? { deliveryResourceId: filters.deliveryResourceId }
        : {}),
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
    };

    if (search) {
      const searchOr: Prisma.FulfilmentWhereInput[] = [
        { fulfilmentNumber: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { user: { fullName: { contains: search, mode: 'insensitive' } } } },
        { order: { user: { businessName: { contains: search, mode: 'insensitive' } } } },
        { order: { user: { phone: { contains: search } } } },
      ];
      where.AND = [
        ...(Object.keys(orderFilter).length > 0 ? [{ order: orderFilter }] : []),
        { OR: searchOr },
      ];
    } else if (Object.keys(orderFilter).length > 0) {
      where.order = orderFilter;
    }

    const rows = await prisma.fulfilment.findMany({
      where,
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: LIST_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const data = sliced.map((row) => {
      const { deliveryAccessTokens, ...rest } = row;
      return {
        ...rest,
        magicLink: mapMagicLink(deliveryAccessTokens),
      };
    });

    return { data, nextCursor, hasMore };
  }

  async getById(vendorId: string, fulfilmentId: string) {
    const row = await prisma.fulfilment.findFirst({
      where: { id: fulfilmentId, vendorId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw Errors.notFound('Fulfilment');
    const { deliveryAccessTokens, ...rest } = row;
    return {
      ...rest,
      magicLink: mapMagicLink(deliveryAccessTokens),
    };
  }

  async dispatchAction(
    vendorId: string,
    fulfilmentId: string,
    body: FulfilmentActionBody,
    actorId?: string | null,
  ) {
    switch (body.action) {
      case 'mark_packed':
        return this.markPacked(vendorId, fulfilmentId, actorId);
      case 'assign_and_dispatch':
        return this.assignAndDispatch(vendorId, fulfilmentId, body, actorId);
      case 'record_failed_delivery':
        return this.recordFailedDelivery(vendorId, fulfilmentId, body, actorId);
      case 'reschedule_dispatch':
        return this.rescheduleDispatch(vendorId, fulfilmentId, body, actorId);
      case 'override_mark_delivered':
        return this.overrideMarkDelivered(vendorId, fulfilmentId, body, actorId);
      case 'mark_delivered':
        return this.markDelivered(vendorId, fulfilmentId, body, actorId);
      default: {
        const _exhaustive: never = body;
        void _exhaustive;
        throw Errors.badRequest('Unknown delivery action');
      }
    }
  }

  async bulkAction(
    vendorId: string,
    body: FulfilmentBulkActionBody,
    actorId?: string | null,
  ) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of body.fulfilmentIds) {
      try {
        await this.assignAndDispatch(
          vendorId,
          id,
          {
            action: 'assign_and_dispatch',
            deliveryBoyName: body.deliveryBoyName,
            deliveryBoyPhone: body.deliveryBoyPhone,
            eta: body.eta,
          },
          actorId,
        );
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : 'Failed',
        });
      }
    }
    return { results };
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private async loadOwned(vendorId: string, fulfilmentId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;
    const row = await db.fulfilment.findFirst({
      where: { id: fulfilmentId, vendorId },
      include: {
        items: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            vendorId: true,
            fulfillmentOutletId: true,
            outletId: true,
            deliveryOtp: true,
            deliveryOtpExpiresAt: true,
            deliveryOtpVerifiedAt: true,
            deliveryProofType: true,
            deliveryProofUrl: true,
            deliveryNotes: true,
          },
        },
        picklists: {
          where: { status: { in: ['draft', 'printed', 'picked'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        dispatches: {
          where: { status: { in: ['pending', 'out_for_delivery', 'failed_delivery'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        deliveryResource: true,
      },
    });
    if (!row) throw Errors.notFound('Fulfilment');
    return row;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    input: {
      fulfilmentId: string;
      actorId?: string | null;
      action: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      payload?: Record<string, unknown> | null;
    },
  ) {
    return tx.fulfilmentEvent.create({
      data: {
        id: randomUUID(),
        fulfilmentId: input.fulfilmentId,
        actorId: input.actorId ?? null,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async appendDeliveryEvent(
    tx: Prisma.TransactionClient,
    input: {
      fulfilmentId: string;
      actorId?: string | null;
      kind: (typeof DELIVERY_EVENT_KINDS)[number];
      payload?: Record<string, unknown> | null;
    },
  ) {
    return tx.deliveryEvent.create({
      data: {
        id: randomUUID(),
        fulfilmentId: input.fulfilmentId,
        actorId: input.actorId ?? null,
        kind: input.kind,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Sync Order.status at defined stage gates. Uses OrderService transitions
   * (outside the fulfilment tx) so inventory/credit side-effects stay intact.
   * No-ops when already at/past the target status.
   */
  private async syncOrderGate(
    orderId: string,
    vendorId: string,
    target: 'processing' | 'ready_for_dispatch' | 'shipped' | 'delivered',
    actorId?: string | null,
    proof?: { proofType?: string; proofUrl?: string | null; notes?: string; otp?: string },
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      select: { status: true },
    });
    if (!order) return;

    const rank: Record<string, number> = {
      draft: 0,
      pending: 1,
      confirmed: 2,
      processing: 3,
      ready_for_dispatch: 4,
      shipped: 5,
      partially_delivered: 5,
      delivered: 6,
      returned: 7,
      cancelled: -1,
    };

    const currentRank = rank[order.status] ?? 0;
    const targetRank = rank[target] ?? 0;
    if (currentRank < 0 || currentRank >= targetRank) return;

    const path: Array<'processing' | 'ready_for_dispatch' | 'shipped' | 'delivered'> = [];
    if (targetRank >= 3 && currentRank < 3) path.push('processing');
    if (targetRank >= 4 && currentRank < 4) path.push('ready_for_dispatch');
    if (targetRank >= 5 && currentRank < 5 && target !== 'delivered') path.push('shipped');
    if (target === 'shipped' && !path.includes('shipped') && currentRank < 5) path.push('shipped');
    if (target === 'delivered') {
      if (currentRank < 5) path.push('shipped');
      path.push('delivered');
    }

    const uniquePath = [...new Set(path)];
    for (const step of uniquePath) {
      const latest = await prisma.order.findFirst({
        where: { id: orderId, vendorId },
        select: { status: true },
      });
      if (!latest || latest.status === step) continue;
      if ((rank[latest.status] ?? 0) >= (rank[step] ?? 0)) continue;

      try {
        const orderService = await this.getOrderService();
        await orderService.updateStatus(
          orderId,
          vendorId,
          step,
          undefined,
          step === 'delivered' ? proof : undefined,
          false,
          actorId,
        );
      } catch (err) {
        const again = await prisma.order.findFirst({
          where: { id: orderId, vendorId },
          select: { status: true },
        });
        if (again && (rank[again.status] ?? 0) >= (rank[step] ?? 0)) continue;
        throw err;
      }
    }
  }

  private async mirrorOrderEvent(
    orderId: string,
    actorId: string | null | undefined,
    action: string,
    fromStatus: string | null,
    toStatus: string | null,
    payload?: Record<string, unknown>,
  ) {
    await prisma.$transaction(async (tx) => {
      await recordOrderEvent(tx, {
        orderId,
        actorId,
        action,
        fromStatus,
        toStatus,
        payload: payload ?? null,
      });
    });
  }

  /** Find-or-create an executive DeliveryResource by name + phone. */
  private async resolveDeliveryBoy(
    tx: Prisma.TransactionClient,
    vendorId: string,
    name: string,
    phone: string,
  ) {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    const byPhone = await tx.deliveryResource.findFirst({
      where: { vendorId, phone: trimmedPhone, isActive: true },
    });
    if (byPhone) {
      if (byPhone.name !== trimmedName) {
        return tx.deliveryResource.update({
          where: { id: byPhone.id },
          data: { name: trimmedName },
        });
      }
      return byPhone;
    }

    return tx.deliveryResource.create({
      data: {
        id: randomUUID(),
        vendorId,
        type: 'executive',
        name: trimmedName,
        phone: trimmedPhone,
        isActive: true,
      },
    });
  }

  // ─── slim Delivery actions ─────────────────────────────────────────────────

  private async markPacked(
    vendorId: string,
    fulfilmentId: string,
    actorId?: string | null,
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const f = await this.loadOwned(vendorId, fulfilmentId, tx);
      assertStatus(f.status, DELIVERY_ACCEPTED_DB_STATUSES, 'mark_packed');

      for (const item of f.items) {
        const qty = item.acceptedQty;
        if (item.pickedQty !== qty || item.packedQty !== qty) {
          await tx.fulfilmentItem.update({
            where: { id: item.id },
            data: { pickedQty: qty, packedQty: qty },
          });
        }
      }

      const fromStatus = f.status;
      const toStatus: FulfilmentStatus = 'packed';
      await tx.fulfilment.update({
        where: { id: f.id },
        data: { status: toStatus },
      });

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.MARK_PACKED,
        fromStatus,
        toStatus,
        payload: { itemCount: f.items.length },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus,
      });

      return { fulfilmentId: f.id, orderId: f.orderId, fromStatus };
    });

    await this.syncOrderGate(updated.orderId, vendorId, 'ready_for_dispatch', actorId);
    await this.mirrorOrderEvent(
      updated.orderId,
      actorId,
      FULFILMENT_EVENT_ACTIONS.MARK_PACKED,
      updated.fromStatus,
      'packed',
      { fulfilmentId: updated.fulfilmentId },
    );
    return this.getById(vendorId, updated.fulfilmentId);
  }

  private async assignAndDispatch(
    vendorId: string,
    fulfilmentId: string,
    body: Extract<FulfilmentActionBody, { action: 'assign_and_dispatch' }>,
    actorId?: string | null,
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const f = await this.loadOwned(vendorId, fulfilmentId, tx);
      assertStatus(f.status, DELIVERY_PACKED_DB_STATUSES, 'assign_and_dispatch');

      const resource = await this.resolveDeliveryBoy(
        tx,
        vendorId,
        body.deliveryBoyName,
        body.deliveryBoyPhone,
      );

      const now = new Date();
      const eta = body.eta ? new Date(body.eta) : undefined;
      const outletId = f.outletId ?? f.order.fulfillmentOutletId ?? f.order.outletId;
      let dispatch = f.dispatches[0] ?? null;

      if (!dispatch) {
        dispatch = await tx.dispatch.create({
          data: {
            id: randomUUID(),
            vendorId,
            outletId,
            orderId: f.orderId,
            fulfilmentId: f.id,
            deliveryResourceId: resource.id,
            picklistId: f.picklists[0]?.id ?? null,
            status: 'out_for_delivery',
            driverName: resource.name,
            vehicleNumber: null,
            notes: null,
            dispatchedAt: now,
          },
        });
      } else {
        dispatch = await tx.dispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'out_for_delivery',
            deliveryResourceId: resource.id,
            driverName: resource.name,
            dispatchedAt: dispatch.dispatchedAt ?? now,
            deliveredAt: null,
            fulfilmentId: f.id,
          },
        });
      }

      const fromStatus = f.status;
      const toStatus: FulfilmentStatus = 'out_for_delivery';
      await tx.fulfilment.update({
        where: { id: f.id },
        data: {
          status: toStatus,
          deliveryResourceId: resource.id,
          failedReason: null,
          ...(eta ? { eta } : {}),
        },
      });

      const magicLink = await this.deliveryLinks.createToken(tx, {
        orderId: f.orderId,
        fulfilmentId: f.id,
        deliveryBoyName: resource.name,
        deliveryBoyPhone: resource.phone ?? body.deliveryBoyPhone,
      });

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.RESOURCE_ASSIGNED,
        fromStatus,
        toStatus: fromStatus,
        payload: {
          deliveryResourceId: resource.id,
          name: resource.name,
          phone: resource.phone,
          eta: eta?.toISOString() ?? null,
        },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.DISPATCHED,
        fromStatus,
        toStatus,
        payload: {
          dispatchId: dispatch.id,
          driverName: resource.name,
          phone: resource.phone,
          magicLinkPath: magicLink.path,
          magicLinkToken: magicLink.token,
        },
      });
      if (fromStatus !== toStatus) {
        await this.appendEvent(tx, {
          fulfilmentId: f.id,
          actorId,
          action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
          fromStatus,
          toStatus,
        });
      }
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'assigned',
        payload: {
          deliveryResourceId: resource.id,
          name: resource.name,
          phone: resource.phone,
        },
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'en_route',
        payload: {
          dispatchId: dispatch.id,
          driverName: resource.name,
          magicLinkPath: magicLink.path,
        },
      });

      return {
        fulfilmentId: f.id,
        orderId: f.orderId,
        fromStatus,
      };
    });

    await this.syncOrderGate(updated.orderId, vendorId, 'shipped', actorId);
    await this.mirrorOrderEvent(
      updated.orderId,
      actorId,
      FULFILMENT_EVENT_ACTIONS.DISPATCHED,
      updated.fromStatus,
      'out_for_delivery',
      { fulfilmentId: updated.fulfilmentId },
    );
    return this.getById(vendorId, updated.fulfilmentId);
  }

  private async recordFailedDelivery(
    vendorId: string,
    fulfilmentId: string,
    body: Extract<FulfilmentActionBody, { action: 'record_failed_delivery' }>,
    actorId?: string | null,
  ) {
    const reasonText = formatDeliveryFailReason(
      body.failedReason,
      body.failedReasonOther,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const f = await this.loadOwned(vendorId, fulfilmentId, tx);
      assertStatus(f.status, ['out_for_delivery'], 'record_failed_delivery');

      const fromStatus = f.status;
      const toStatus: FulfilmentStatus = 'failed_delivery';
      await tx.fulfilment.update({
        where: { id: f.id },
        data: { status: toStatus, failedReason: reasonText },
      });

      const activeDispatch = f.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'failed_delivery', notes: reasonText },
        });
      }

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.FAILED_DELIVERY,
        fromStatus,
        toStatus,
        payload: {
          failedReason: body.failedReason,
          failedReasonOther: body.failedReasonOther ?? null,
          reasonText,
        },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus,
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'failed',
        payload: { failedReason: reasonText },
      });

      // Intentionally does NOT sync Order — stays shipped.
      return f.id;
    });

    return this.getById(vendorId, updated);
  }

  private async rescheduleDispatch(
    vendorId: string,
    fulfilmentId: string,
    body: Extract<FulfilmentActionBody, { action: 'reschedule_dispatch' }>,
    actorId?: string | null,
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const f = await this.loadOwned(vendorId, fulfilmentId, tx);
      assertStatus(f.status, ['failed_delivery'], 'reschedule_dispatch');

      const eta = body.eta ? new Date(body.eta) : null;
      const fromStatus = f.status;
      // Resume at Packed so vendor must re-assign boy + dispatch.
      const toStatus: FulfilmentStatus = 'packed';

      await tx.fulfilment.update({
        where: { id: f.id },
        data: {
          status: toStatus,
          redeliveryAt: eta ?? new Date(),
          eta,
          failedReason: null,
          deliveryResourceId: null,
        },
      });

      await this.deliveryLinks.revokeActiveForFulfilment(tx, f.id);

      const activeDispatch = f.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: {
            status: 'pending',
            notes: body.notes ?? activeDispatch.notes,
            deliveredAt: null,
            deliveryResourceId: null,
            driverName: null,
          },
        });
      }

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.RESCHEDULE_DISPATCH,
        fromStatus,
        toStatus,
        payload: {
          eta: eta?.toISOString() ?? null,
          notes: body.notes ?? null,
        },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus,
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'redelivery',
        payload: {
          resumeStatus: toStatus,
          eta: eta?.toISOString() ?? null,
        },
      });

      return { fulfilmentId: f.id, orderId: f.orderId };
    });

    await this.syncOrderGate(updated.orderId, vendorId, 'ready_for_dispatch', actorId);
    return this.getById(vendorId, updated.fulfilmentId);
  }

  private async overrideMarkDelivered(
    vendorId: string,
    fulfilmentId: string,
    body: Extract<FulfilmentActionBody, { action: 'override_mark_delivered' }>,
    actorId?: string | null,
  ) {
    const f = await this.loadOwned(vendorId, fulfilmentId);
    assertStatus(
      f.status,
      ['out_for_delivery', 'failed_delivery'],
      'override_mark_delivered',
    );

    const note = body.note.trim();
    const proof = {
      proofType: 'notes' as const,
      proofUrl: null as string | null,
      notes: `Vendor override: ${note}`,
    };

    await prisma.$transaction(async (tx) => {
      const fromStatus = f.status;
      const toStatus: FulfilmentStatus = 'delivered';

      await tx.order.update({
        where: { id: f.orderId },
        data: {
          deliveryProofType: 'none',
          deliveryNotes: proof.notes,
        },
      });

      await tx.fulfilment.update({
        where: { id: f.id },
        data: { status: toStatus, failedReason: null },
      });

      const activeDispatch = f.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
      }

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.OVERRIDE_DELIVERED,
        fromStatus,
        toStatus,
        payload: { note, override: true },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus,
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'arrived',
        payload: { delivered: true, override: true, note },
      });
    });

    await this.syncOrderGate(f.orderId, vendorId, 'delivered', actorId, proof);
    await this.mirrorOrderEvent(
      f.orderId,
      actorId,
      FULFILMENT_EVENT_ACTIONS.OVERRIDE_DELIVERED,
      f.status,
      'delivered',
      { fulfilmentId: f.id, note },
    );
    return this.getById(vendorId, f.id);
  }

  private async markDelivered(
    vendorId: string,
    fulfilmentId: string,
    body: Extract<FulfilmentActionBody, { action: 'mark_delivered' }>,
    actorId?: string | null,
  ) {
    const f = await this.loadOwned(vendorId, fulfilmentId);
    assertStatus(f.status, ['out_for_delivery'], 'mark_delivered');

    const now = new Date();
    const otp = body.otp.trim();

    if (!f.order.deliveryOtp) {
      throw Errors.badRequest(
        'No delivery OTP on this order. Request OTP from the delivery link, or use override mark delivered.',
      );
    }
    if (otp !== f.order.deliveryOtp) {
      throw Errors.badRequest(
        'Delivery OTP does not match. Ask the customer for the code sent to their phone.',
      );
    }
    if (f.order.deliveryOtpExpiresAt && f.order.deliveryOtpExpiresAt < now) {
      throw Errors.badRequest('Delivery OTP has expired. Request a new OTP and retry.');
    }

    const proof = {
      proofType: 'otp' as const,
      proofUrl: null as string | null,
      notes: 'Confirmed via Delivery Workspace (OTP verified)',
      otp,
    };

    await prisma.$transaction(async (tx) => {
      const fromStatus = f.status;
      const toStatus: FulfilmentStatus = 'delivered';

      await tx.order.update({
        where: { id: f.orderId },
        data: {
          deliveryOtpVerifiedAt: now,
          deliveryProofType: 'otp',
          deliveryNotes: proof.notes,
        },
      });

      await tx.fulfilment.update({
        where: { id: f.id },
        data: { status: toStatus, failedReason: null },
      });

      const activeDispatch = f.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'delivered', deliveredAt: now },
        });
      }

      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.POD_CAPTURED,
        fromStatus,
        toStatus: fromStatus,
        payload: { proofType: 'otp' },
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.DELIVERED,
        fromStatus,
        toStatus,
      });
      await this.appendEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus,
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'pod',
        payload: { proofType: 'otp' },
      });
      await this.appendDeliveryEvent(tx, {
        fulfilmentId: f.id,
        actorId,
        kind: 'arrived',
        payload: { delivered: true },
      });
    });

    await this.syncOrderGate(f.orderId, vendorId, 'delivered', actorId, {
      proofType: 'notes',
      proofUrl: null,
      notes: proof.notes,
    });
    await this.mirrorOrderEvent(
      f.orderId,
      actorId,
      FULFILMENT_EVENT_ACTIONS.DELIVERED,
      'out_for_delivery',
      'delivered',
      { fulfilmentId: f.id },
    );
    return this.getById(vendorId, f.id);
  }

  /** Soft status check helper for external callers / tests. */
  isKnownStatus(status: string): status is FulfilmentStatus {
    return (FULFILMENT_STATUSES as readonly string[]).includes(status);
  }

  async listDeliveryResources(vendorId: string, opts?: { activeOnly?: boolean }) {
    return prisma.deliveryResource.findMany({
      where: {
        vendorId,
        ...(opts?.activeOnly === false ? {} : { isActive: true }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        type: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createDeliveryResource(
    vendorId: string,
    input: { type: 'executive' | 'vehicle' | 'logistics_partner'; name: string; phone?: string },
  ) {
    return prisma.deliveryResource.create({
      data: {
        vendorId,
        type: input.type,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
      },
      select: {
        id: true,
        type: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
  }
}

export const fulfilmentService = new FulfilmentService();

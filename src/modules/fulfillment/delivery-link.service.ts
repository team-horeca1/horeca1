import { randomBytes, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  formatDeliveryFailReason,
  toDeliveryUiStatus,
  type DeliveryFailReason,
} from '@/modules/fulfillment/delivery.scope';
import {
  FULFILMENT_EVENT_ACTIONS,
  type FulfilmentStatus,
} from '@/modules/fulfillment/fulfillment.types';
import type { OrderService } from '@/modules/order/order.service';
import { recordOrderEvent } from '@/modules/order/order-events';
import {
  returnPickupLinkPath,
} from '@/modules/return/return-pickup-link.service';

type Db = Prisma.TransactionClient | typeof prisma;

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SnapshotAddr = {
  name?: string | null;
  addressLine?: string | null;
  flatInfo?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function deliveryLinkPath(token: string): string {
  return `/d/${token}`;
}

export function deliveryBoyLinkPath(token: string): string {
  return `/d/b/${token}`;
}

export function deliveryBoyOrderPath(token: string, fulfilmentId: string): string {
  return `/d/b/${token}/${fulfilmentId}`;
}

export function deliveryLinkAbsoluteUrl(token: string): string {
  const base = (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${deliveryLinkPath(token)}`;
}

export function deliveryBoyLinkAbsoluteUrl(token: string): string {
  const base = (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${deliveryBoyLinkPath(token)}`;
}

const BOY_OPEN_STATUSES = ['out_for_delivery', 'failed_delivery'] as const;
/** Order statuses that must not appear as open delivery tasks. */
const CLOSED_ORDER_STATUSES = ['delivered', 'cancelled', 'returned'] as const;

function isClosedOrderStatus(status: string): boolean {
  return (CLOSED_ORDER_STATUSES as readonly string[]).includes(status);
}

function formatAddress(snapshot: unknown): {
  lines: string[];
  pincode: string | null;
  label: string | null;
} {
  const snap = (snapshot ?? null) as SnapshotAddr | null;
  if (!snap) return { lines: [], pincode: null, label: null };
  const lines = [
    snap.flatInfo,
    snap.addressLine,
    snap.landmark ? `Near ${snap.landmark}` : null,
    [snap.city, snap.state].filter(Boolean).join(', ') || null,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return {
    lines,
    pincode: snap.pincode ?? null,
    label: snap.name?.trim() || null,
  };
}

/**
 * Public magic-link POD for delivery boys.
 * Tokens are created on assign_and_dispatch; revoked on reschedule.
 */
export class DeliveryLinkService {
  private _orderService: OrderService | null = null;

  private async getOrderService(): Promise<OrderService> {
    if (!this._orderService) {
      const mod = await import('@/modules/order/order.service');
      this._orderService = new mod.OrderService();
    }
    return this._orderService;
  }

  /** Create a new token; revoke any prior active tokens for the fulfilment. */
  async createToken(
    db: Db,
    input: {
      orderId: string;
      fulfilmentId: string;
      deliveryBoyName: string;
      deliveryBoyPhone: string;
      expiresAt?: Date;
    },
  ): Promise<{ id: string; token: string; path: string; url: string; expiresAt: Date }> {
    const now = new Date();
    await db.deliveryAccessToken.updateMany({
      where: {
        fulfilmentId: input.fulfilmentId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    const token = generateOpaqueToken();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + TOKEN_TTL_MS);
    const row = await db.deliveryAccessToken.create({
      data: {
        id: randomUUID(),
        token,
        orderId: input.orderId,
        fulfilmentId: input.fulfilmentId,
        deliveryBoyName: input.deliveryBoyName.trim(),
        deliveryBoyPhone: input.deliveryBoyPhone.trim(),
        expiresAt,
      },
      select: { id: true, token: true, expiresAt: true },
    });

    return {
      id: row.id,
      token: row.token,
      path: deliveryLinkPath(row.token),
      url: deliveryLinkAbsoluteUrl(row.token),
      expiresAt: row.expiresAt,
    };
  }

  /** Revoke all active tokens for a fulfilment (e. and on reschedule). */
  async revokeActiveForFulfilment(db: Db, fulfilmentId: string): Promise<number> {
    const result = await db.deliveryAccessToken.updateMany({
      where: { fulfilmentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async getActiveTokenForFulfilment(fulfilmentId: string) {
    return prisma.deliveryAccessToken.findFirst({
      where: {
        fulfilmentId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        deliveryBoyName: true,
        deliveryBoyPhone: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });
  }

  private async loadByToken(token: string) {
    const row = await prisma.deliveryAccessToken.findUnique({
      where: { token },
      include: {
        fulfilment: {
          include: {
            items: {
              include: {
                orderItem: {
                  select: {
                    id: true,
                    productName: true,
                    quantity: true,
                    product: { select: { sku: true, unit: true, imageUrl: true } },
                  },
                },
              },
            },
            dispatches: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                driverName: true,
                dispatchedAt: true,
                deliveredAt: true,
              },
            },
            vendor: {
              select: {
                id: true,
                businessName: true,
                displayName: true,
                logoUrl: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryDate: true,
            deliveryAddressSnapshot: true,
            deliveryOtp: true,
            deliveryOtpExpiresAt: true,
            deliveryOtpVerifiedAt: true,
            deliveredAt: true,
            totalAmount: true,
            paymentMethod: true,
            user: {
              select: {
                fullName: true,
                businessName: true,
                phone: true,
                email: true,
              },
            },
            outlet: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Delivery link');
    return row;
  }

  private assertTokenUsable(
    row: Awaited<ReturnType<DeliveryLinkService['loadByToken']>>,
    opts: { requireActionable?: boolean } = {},
  ) {
    const now = new Date();
    if (row.revokedAt) {
      throw Errors.badRequest(
        'This delivery link was revoked. Ask the vendor for a new dispatch link.',
      );
    }
    if (row.expiresAt < now) {
      throw Errors.badRequest('This delivery link has expired. Ask the vendor to redispatch.');
    }
    if (opts.requireActionable) {
      if (row.usedAt) {
        throw Errors.badRequest('This delivery is already completed.');
      }
      this.assertDeliveryActionable(row.fulfilment.status, row.order.status);
    }
  }

  /** Reject OTP/complete/fail when fulfilment or commercial order is closed. */
  private assertDeliveryActionable(fulfilmentStatus: string, orderStatus: string) {
    if (isClosedOrderStatus(orderStatus)) {
      throw Errors.badRequest(
        orderStatus === 'delivered'
          ? 'This order is already delivered.'
          : `This order is closed (status: ${orderStatus}).`,
      );
    }
    if (fulfilmentStatus !== 'out_for_delivery') {
      if (fulfilmentStatus === 'failed_delivery') {
        throw Errors.badRequest(
          'Delivery attempt already failed. Wait for the vendor to reschedule.',
        );
      }
      if (fulfilmentStatus === 'delivered') {
        throw Errors.badRequest('This order is already delivered.');
      }
      throw Errors.badRequest(
        `Cannot act on this delivery while status is "${fulfilmentStatus}".`,
      );
    }
  }

  /**
   * When Order is already delivered but Fulfilment stayed open, close the
   * fulfilment (+ active dispatch) so boy portal / counts stay consistent.
   */
  async healFulfilmentIfOrderDelivered(fulfilmentId: string): Promise<boolean> {
    const row = await prisma.fulfilment.findFirst({
      where: {
        id: fulfilmentId,
        status: { in: [...BOY_OPEN_STATUSES] },
        order: { status: 'delivered' },
      },
      select: {
        id: true,
        dispatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!row) return false;

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.fulfilment.update({
        where: { id: row.id },
        data: { status: 'delivered', failedReason: null },
      });
      if (row.dispatches[0]) {
        await tx.dispatch.update({
          where: { id: row.dispatches[0].id },
          data: { status: 'delivered', deliveredAt: now },
        });
      }
      await tx.deliveryAccessToken.updateMany({
        where: { fulfilmentId: row.id, revokedAt: null, usedAt: null },
        data: { usedAt: now },
      });
    });
    return true;
  }

  /** Heal all open fulfilments for this boy whose orders are already delivered. */
  private async healBoyDesyncedDeliveries(deliveryResourceId: string): Promise<void> {
    const desynced = await prisma.fulfilment.findMany({
      where: {
        deliveryResourceId,
        status: { in: [...BOY_OPEN_STATUSES] },
        order: { status: 'delivered' },
      },
      select: { id: true },
      take: 50,
    });
    for (const f of desynced) {
      try {
        await this.healFulfilmentIfOrderDelivered(f.id);
      } catch (err) {
        console.error('[DeliveryLink] heal desynced fulfilment failed:', f.id, err);
      }
    }
  }

  /** Public view payload — never includes the customer OTP code. */
  async getPublicView(token: string) {
    const loaded = await this.loadByToken(token);
    await this.healFulfilmentIfOrderDelivered(loaded.fulfilmentId);
    const row = await this.loadByToken(token);
    const now = new Date();
    const orderClosed = isClosedOrderStatus(row.order.status);
    const uiStatus =
      orderClosed && row.order.status === 'delivered'
        ? toDeliveryUiStatus('delivered')
        : toDeliveryUiStatus(row.fulfilment.status);
    const actionable =
      !row.revokedAt &&
      row.expiresAt > now &&
      !row.usedAt &&
      row.fulfilment.status === 'out_for_delivery' &&
      !orderClosed;

    const address = formatAddress(row.order.deliveryAddressSnapshot);
    const customerName =
      row.order.user.fullName ||
      row.order.user.businessName ||
      address.label ||
      row.order.outlet?.name ||
      'Customer';

    return {
      token: row.token,
      path: deliveryLinkPath(row.token),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      usedAt: row.usedAt?.toISOString() ?? null,
      deliveryBoyName: row.deliveryBoyName,
      deliveryBoyPhone: row.deliveryBoyPhone,
      status: uiStatus,
      fulfilmentStatus: row.fulfilment.status,
      failedReason: row.fulfilment.failedReason,
      canRequestOtp: actionable,
      canComplete: actionable,
      canFail: actionable,
      vendor: {
        name: row.fulfilment.vendor.displayName || row.fulfilment.vendor.businessName,
        logoUrl: row.fulfilment.vendor.logoUrl,
      },
      order: {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        status: row.order.status,
        deliveryDate: row.order.deliveryDate?.toISOString() ?? null,
        paymentMethod: row.order.paymentMethod,
        totalAmount: row.order.totalAmount.toString(),
        deliveredAt: row.order.deliveredAt?.toISOString() ?? null,
        customer: {
          name: customerName,
          phone: row.order.user.phone,
          email: row.order.user.email,
        },
        address: {
          label: address.label,
          lines: address.lines,
          pincode: address.pincode,
          full: [...address.lines, address.pincode].filter(Boolean).join(', '),
        },
        items: row.fulfilment.items.map((item) => ({
          id: item.id,
          productName: item.orderItem.productName,
          qty: item.acceptedQty || item.orderItem.quantity,
          packedQty: item.packedQty,
          sku: item.orderItem.product?.sku ?? null,
          unit: item.orderItem.product?.unit ?? null,
          imageUrl: item.orderItem.product?.imageUrl ?? null,
        })),
      },
      dispatch: row.fulfilment.dispatches[0]
        ? {
            id: row.fulfilment.dispatches[0].id,
            status: row.fulfilment.dispatches[0].status,
            driverName: row.fulfilment.dispatches[0].driverName,
            dispatchedAt: row.fulfilment.dispatches[0].dispatchedAt?.toISOString() ?? null,
            deliveredAt: row.fulfilment.dispatches[0].deliveredAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Issue/send delivery OTP to the customer phone when the boy taps Complete.
   * Does not return the OTP to the caller.
   */
  async requestOtp(token: string) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const orderService = await this.getOrderService();
    // Always rotate + emit so the customer gets a fresh SMS for this attempt.
    const result = await orderService.issueDeliveryOtp(
      row.orderId,
      row.fulfilment.vendorId,
      { emitEvent: true },
    );

    return {
      sent: true,
      expiresAt: result.expiresAt.toISOString(),
      customerPhoneMasked: maskPhone(row.order.user.phone),
    };
  }

  async complete(token: string, otp: string) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const now = new Date();
    const code = otp.trim();
    const order = row.order;

    if (!order.deliveryOtp) {
      throw Errors.badRequest(
        'No delivery OTP yet. Tap Complete Delivery to send an OTP to the customer first.',
      );
    }
    if (code !== order.deliveryOtp) {
      throw Errors.badRequest(
        'Delivery OTP does not match. Ask the customer for the code sent to their phone.',
      );
    }
    if (order.deliveryOtpExpiresAt && order.deliveryOtpExpiresAt < now) {
      throw Errors.badRequest('Delivery OTP has expired. Request a new OTP and retry.');
    }

    const proofNotes = 'Confirmed via delivery magic link (OTP verified)';
    const fromStatus = row.fulfilment.status;
    const toStatus: FulfilmentStatus = 'delivered';
    const vendorId = row.fulfilment.vendorId;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: row.orderId },
        data: {
          deliveryOtpVerifiedAt: now,
          deliveryProofType: 'otp',
          deliveryNotes: proofNotes,
        },
      });

      await tx.fulfilment.update({
        where: { id: row.fulfilmentId },
        data: { status: toStatus, failedReason: null },
      });

      const activeDispatch = row.fulfilment.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'delivered', deliveredAt: now },
        });
      }

      await tx.deliveryAccessToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      });

      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.POD_CAPTURED,
          fromStatus,
          toStatus: fromStatus,
          payload: { proofType: 'otp', via: 'magic_link' },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.DELIVERED,
          fromStatus,
          toStatus,
          payload: { via: 'magic_link' },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
          fromStatus,
          toStatus,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          kind: 'pod',
          payload: { proofType: 'otp', via: 'magic_link' },
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          kind: 'arrived',
          payload: { delivered: true, via: 'magic_link' },
        },
      });
    });

    const orderService = await this.getOrderService();
    try {
      await orderService.updateStatus(
        row.orderId,
        vendorId,
        'delivered',
        undefined,
        {
          proofType: 'notes',
          proofUrl: null,
          notes: proofNotes,
        },
        false,
        null,
      );

      await prisma.$transaction(async (tx) => {
        await recordOrderEvent(tx, {
          orderId: row.orderId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.DELIVERED,
          fromStatus: 'shipped',
          toStatus: 'delivered',
          payload: { fulfilmentId: row.fulfilmentId, via: 'magic_link' },
        });
      });
    } catch (err) {
      // Fulfilment + token already committed above — still return public view
      // so the boy UI can flip to Delivered without a hard refresh.
      console.error('[DeliveryLink] post-complete order sync failed:', err);
    }

    return this.getPublicView(token);
  }

  async fail(
    token: string,
    failedReason: DeliveryFailReason,
    failedReasonOther?: string,
  ) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const reasonText = formatDeliveryFailReason(failedReason, failedReasonOther);
    const fromStatus = row.fulfilment.status;
    const toStatus: FulfilmentStatus = 'failed_delivery';

    await prisma.$transaction(async (tx) => {
      await tx.fulfilment.update({
        where: { id: row.fulfilmentId },
        data: { status: toStatus, failedReason: reasonText },
      });

      const activeDispatch = row.fulfilment.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'failed_delivery', notes: reasonText },
        });
      }

      // Link stays viewable; complete stays disabled until vendor redispatches.
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.FAILED_DELIVERY,
          fromStatus,
          toStatus,
          payload: {
            failedReason,
            failedReasonOther: failedReasonOther ?? null,
            reasonText,
            via: 'magic_link',
          },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
          fromStatus,
          toStatus,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: row.fulfilmentId,
          actorId: null,
          kind: 'failed',
          payload: { failedReason: reasonText, via: 'magic_link' },
        },
      });

      // Order stays shipped — never complete on fail attempt.
      await recordOrderEvent(tx, {
        orderId: row.orderId,
        actorId: null,
        action: FULFILMENT_EVENT_ACTIONS.FAILED_DELIVERY,
        fromStatus: 'shipped',
        toStatus: 'shipped',
        payload: {
          fulfilmentId: row.fulfilmentId,
          failedReason: reasonText,
          via: 'magic_link',
        },
      });
    });

    return this.getPublicView(token);
  }

  // ─── Boy portal (shared link per DeliveryResource) ─────────────────────────

  /** Ensure one active portal token for the boy; reuse if still valid. */
  async ensureBoyToken(
    db: Db,
    input: {
      vendorId: string;
      deliveryResourceId: string;
      expiresAt?: Date;
    },
  ): Promise<{ id: string; token: string; path: string; url: string; expiresAt: Date }> {
    const now = new Date();
    const existing = await db.deliveryBoyAccessToken.findFirst({
      where: {
        deliveryResourceId: input.deliveryResourceId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, token: true, expiresAt: true },
    });
    if (existing) {
      return {
        id: existing.id,
        token: existing.token,
        path: deliveryBoyLinkPath(existing.token),
        url: deliveryBoyLinkAbsoluteUrl(existing.token),
        expiresAt: existing.expiresAt,
      };
    }

    const token = generateOpaqueToken();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + TOKEN_TTL_MS);
    const row = await db.deliveryBoyAccessToken.create({
      data: {
        id: randomUUID(),
        token,
        vendorId: input.vendorId,
        deliveryResourceId: input.deliveryResourceId,
        expiresAt,
      },
      select: { id: true, token: true, expiresAt: true },
    });
    return {
      id: row.id,
      token: row.token,
      path: deliveryBoyLinkPath(row.token),
      url: deliveryBoyLinkAbsoluteUrl(row.token),
      expiresAt: row.expiresAt,
    };
  }

  async getActiveBoyTokenForResource(deliveryResourceId: string) {
    return prisma.deliveryBoyAccessToken.findFirst({
      where: {
        deliveryResourceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        deliveryResourceId: true,
        vendorId: true,
      },
    });
  }

  /** Resolve legacy per-order token → boy portal **list** when possible. */
  async resolveLegacyToBoyPortal(token: string): Promise<{
    boyPath: string;
    fulfilmentId: string;
  } | null> {
    const row = await prisma.deliveryAccessToken.findUnique({
      where: { token },
      select: {
        fulfilmentId: true,
        fulfilment: { select: { deliveryResourceId: true, vendorId: true } },
      },
    });
    if (!row?.fulfilment.deliveryResourceId) return null;
    const boy = await this.ensureBoyToken(prisma, {
      vendorId: row.fulfilment.vendorId,
      deliveryResourceId: row.fulfilment.deliveryResourceId,
    });
    return {
      boyPath: deliveryBoyLinkPath(boy.token),
      fulfilmentId: row.fulfilmentId,
    };
  }

  private async loadBoyToken(token: string) {
    const row = await prisma.deliveryBoyAccessToken.findUnique({
      where: { token },
      include: {
        deliveryResource: {
          select: { id: true, name: true, phone: true, isActive: true },
        },
        vendor: {
          select: {
            id: true,
            businessName: true,
            displayName: true,
            logoUrl: true,
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Delivery boy link');
    const now = new Date();
    if (row.revokedAt) {
      throw Errors.badRequest(
        'This delivery boy link was revoked. Ask the vendor for a new link.',
      );
    }
    if (row.expiresAt < now) {
      throw Errors.badRequest('This delivery boy link has expired. Ask the vendor for a new link.');
    }
    if (!row.deliveryResource.isActive) {
      throw Errors.badRequest('This delivery boy is inactive. Ask the vendor for help.');
    }
    return row;
  }

  /** Page 1 — open deliveries + return pickups for this boy. */
  async getBoyPortalList(token: string) {
    const boy = await this.loadBoyToken(token);
    await this.healBoyDesyncedDeliveries(boy.deliveryResourceId);

    const [fulfilments, pickups] = await Promise.all([
      prisma.fulfilment.findMany({
        where: {
          deliveryResourceId: boy.deliveryResourceId,
          status: { in: [...BOY_OPEN_STATUSES] },
          order: { status: { notIn: [...CLOSED_ORDER_STATUSES] } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          failedReason: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              paymentMethod: true,
              deliveryAddressSnapshot: true,
              user: {
                select: { fullName: true, businessName: true, phone: true },
              },
              outlet: { select: { name: true } },
            },
          },
        },
      }),
      prisma.returnRequest.findMany({
        where: {
          deliveryResourceId: boy.deliveryResourceId,
          status: 'pickup_scheduled',
          order: { vendorId: boy.vendorId },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              deliveryAddressSnapshot: true,
              user: {
                select: { fullName: true, businessName: true, phone: true },
              },
              outlet: { select: { name: true } },
            },
          },
          pickupAccessTokens: {
            where: {
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { token: true },
          },
        },
      }),
    ]);

    return {
      token: boy.token,
      path: deliveryBoyLinkPath(boy.token),
      expiresAt: boy.expiresAt.toISOString(),
      deliveryBoyName: boy.deliveryResource.name,
      deliveryBoyPhone: boy.deliveryResource.phone,
      vendor: {
        name: boy.vendor.displayName || boy.vendor.businessName,
        logoUrl: boy.vendor.logoUrl,
      },
      orders: fulfilments.map((f) => {
        const address = formatAddress(f.order.deliveryAddressSnapshot);
        const customerName =
          f.order.user.fullName ||
          f.order.user.businessName ||
          address.label ||
          f.order.outlet?.name ||
          'Customer';
        return {
          fulfilmentId: f.id,
          orderId: f.order.id,
          orderNumber: f.order.orderNumber,
          status: toDeliveryUiStatus(f.status),
          fulfilmentStatus: f.status,
          failedReason: f.failedReason,
          paymentMethod: f.order.paymentMethod,
          customerName,
          customerPhone: f.order.user.phone,
          addressSummary: [...address.lines, address.pincode].filter(Boolean).join(', ') || null,
          path: deliveryBoyOrderPath(boy.token, f.id),
        };
      }),
      pickups: pickups
        .map((r) => {
          const pickupToken = r.pickupAccessTokens[0]?.token;
          if (!pickupToken) return null;
          const address = formatAddress(r.order.deliveryAddressSnapshot);
          const customerName =
            r.order.user.fullName ||
            r.order.user.businessName ||
            address.label ||
            r.order.outlet?.name ||
            'Customer';
          return {
            returnRequestId: r.id,
            orderId: r.order.id,
            orderNumber: r.order.orderNumber,
            status: r.status,
            customerName,
            customerPhone: r.order.user.phone,
            addressSummary: [...address.lines, address.pincode].filter(Boolean).join(', ') || null,
            path: returnPickupLinkPath(pickupToken),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    };
  }

  private async loadBoyFulfilmentContext(token: string, fulfilmentId: string) {
    const boy = await this.loadBoyToken(token);
    const fulfilment = await prisma.fulfilment.findFirst({
      where: {
        id: fulfilmentId,
        deliveryResourceId: boy.deliveryResourceId,
        vendorId: boy.vendorId,
      },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                productName: true,
                quantity: true,
                product: { select: { sku: true, unit: true, imageUrl: true } },
              },
            },
          },
        },
        dispatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            driverName: true,
            dispatchedAt: true,
            deliveredAt: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryDate: true,
            deliveryAddressSnapshot: true,
            deliveryOtp: true,
            deliveryOtpExpiresAt: true,
            deliveryOtpVerifiedAt: true,
            deliveredAt: true,
            totalAmount: true,
            paymentMethod: true,
            user: {
              select: {
                fullName: true,
                businessName: true,
                phone: true,
                email: true,
              },
            },
            outlet: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!fulfilment) throw Errors.notFound('Delivery order');
    return { boy, fulfilment };
  }

  private assertBoyFulfilmentActionable(
    fulfilmentStatus: string,
    orderStatus: string,
    opts: { requireActionable?: boolean },
  ) {
    if (!opts.requireActionable) return;
    this.assertDeliveryActionable(fulfilmentStatus, orderStatus);
  }

  /** Page 2 — single order POD view (same shape as legacy getPublicView). */
  async getBoyPortalOrderView(token: string, fulfilmentId: string) {
    await this.healFulfilmentIfOrderDelivered(fulfilmentId);
    const { boy, fulfilment } = await this.loadBoyFulfilmentContext(token, fulfilmentId);
    const orderClosed = isClosedOrderStatus(fulfilment.order.status);
    const uiStatus =
      orderClosed && fulfilment.order.status === 'delivered'
        ? toDeliveryUiStatus('delivered')
        : toDeliveryUiStatus(fulfilment.status);
    const actionable = fulfilment.status === 'out_for_delivery' && !orderClosed;
    const address = formatAddress(fulfilment.order.deliveryAddressSnapshot);
    const customerName =
      fulfilment.order.user.fullName ||
      fulfilment.order.user.businessName ||
      address.label ||
      fulfilment.order.outlet?.name ||
      'Customer';

    return {
      token: boy.token,
      path: deliveryBoyOrderPath(boy.token, fulfilment.id),
      listPath: deliveryBoyLinkPath(boy.token),
      expiresAt: boy.expiresAt.toISOString(),
      revokedAt: null as string | null,
      usedAt:
        fulfilment.status === 'delivered' || fulfilment.order.status === 'delivered'
          ? fulfilment.order.deliveredAt?.toISOString() ?? null
          : null,
      deliveryBoyName: boy.deliveryResource.name,
      deliveryBoyPhone: boy.deliveryResource.phone ?? '',
      status: uiStatus,
      fulfilmentStatus: fulfilment.status,
      fulfilmentId: fulfilment.id,
      failedReason: fulfilment.failedReason,
      canRequestOtp: actionable,
      canComplete: actionable,
      canFail: actionable,
      vendor: {
        name: boy.vendor.displayName || boy.vendor.businessName,
        logoUrl: boy.vendor.logoUrl,
      },
      order: {
        id: fulfilment.order.id,
        orderNumber: fulfilment.order.orderNumber,
        status: fulfilment.order.status,
        deliveryDate: fulfilment.order.deliveryDate?.toISOString() ?? null,
        paymentMethod: fulfilment.order.paymentMethod,
        totalAmount: fulfilment.order.totalAmount.toString(),
        deliveredAt: fulfilment.order.deliveredAt?.toISOString() ?? null,
        customer: {
          name: customerName,
          phone: fulfilment.order.user.phone,
          email: fulfilment.order.user.email,
        },
        address: {
          label: address.label,
          lines: address.lines,
          pincode: address.pincode,
          full: [...address.lines, address.pincode].filter(Boolean).join(', '),
        },
        items: fulfilment.items.map((item) => ({
          id: item.id,
          productName: item.orderItem.productName,
          qty: item.acceptedQty || item.orderItem.quantity,
          packedQty: item.packedQty,
          sku: item.orderItem.product?.sku ?? null,
          unit: item.orderItem.product?.unit ?? null,
          imageUrl: item.orderItem.product?.imageUrl ?? null,
        })),
      },
      dispatch: fulfilment.dispatches[0]
        ? {
            id: fulfilment.dispatches[0].id,
            status: fulfilment.dispatches[0].status,
            driverName: fulfilment.dispatches[0].driverName,
            dispatchedAt: fulfilment.dispatches[0].dispatchedAt?.toISOString() ?? null,
            deliveredAt: fulfilment.dispatches[0].deliveredAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async requestOtpViaBoy(token: string, fulfilmentId: string) {
    const { boy, fulfilment } = await this.loadBoyFulfilmentContext(token, fulfilmentId);
    this.assertBoyFulfilmentActionable(fulfilment.status, fulfilment.order.status, {
      requireActionable: true,
    });

    const orderService = await this.getOrderService();
    const result = await orderService.issueDeliveryOtp(fulfilment.orderId, boy.vendorId, {
      emitEvent: true,
    });

    return {
      sent: true,
      expiresAt: result.expiresAt.toISOString(),
      customerPhoneMasked: maskPhone(fulfilment.order.user.phone),
    };
  }

  async completeViaBoy(token: string, fulfilmentId: string, otp: string) {
    const { boy, fulfilment } = await this.loadBoyFulfilmentContext(token, fulfilmentId);
    this.assertBoyFulfilmentActionable(fulfilment.status, fulfilment.order.status, {
      requireActionable: true,
    });

    const now = new Date();
    const code = otp.trim();
    const order = fulfilment.order;

    if (!order.deliveryOtp) {
      throw Errors.badRequest(
        'No delivery OTP yet. Tap Complete Delivery to send an OTP to the customer first.',
      );
    }
    if (code !== order.deliveryOtp) {
      throw Errors.badRequest(
        'Delivery OTP does not match. Ask the customer for the code sent to their phone.',
      );
    }
    if (order.deliveryOtpExpiresAt && order.deliveryOtpExpiresAt < now) {
      throw Errors.badRequest('Delivery OTP has expired. Request a new OTP and retry.');
    }

    const proofNotes = 'Confirmed via delivery boy portal (OTP verified)';
    const fromStatus = fulfilment.status;
    const toStatus: FulfilmentStatus = 'delivered';
    const vendorId = boy.vendorId;
    const orderId = fulfilment.orderId;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryOtpVerifiedAt: now,
          deliveryProofType: 'otp',
          deliveryNotes: proofNotes,
        },
      });

      await tx.fulfilment.update({
        where: { id: fulfilment.id },
        data: { status: toStatus, failedReason: null },
      });

      const activeDispatch = fulfilment.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'delivered', deliveredAt: now },
        });
      }

      await tx.deliveryAccessToken.updateMany({
        where: { fulfilmentId: fulfilment.id, revokedAt: null, usedAt: null },
        data: { usedAt: now },
      });

      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.POD_CAPTURED,
          fromStatus,
          toStatus: fromStatus,
          payload: { proofType: 'otp', via: 'boy_portal' },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.DELIVERED,
          fromStatus,
          toStatus,
          payload: { via: 'boy_portal' },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
          fromStatus,
          toStatus,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          kind: 'pod',
          payload: { proofType: 'otp', via: 'boy_portal' },
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          kind: 'arrived',
          payload: { delivered: true, via: 'boy_portal' },
        },
      });
    });

    const orderService = await this.getOrderService();
    try {
      await orderService.updateStatus(
        orderId,
        vendorId,
        'delivered',
        undefined,
        {
          proofType: 'notes',
          proofUrl: null,
          notes: proofNotes,
        },
        false,
        null,
      );

      await prisma.$transaction(async (tx) => {
        await recordOrderEvent(tx, {
          orderId,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.DELIVERED,
          fromStatus: 'shipped',
          toStatus: 'delivered',
          payload: { fulfilmentId: fulfilment.id, via: 'boy_portal' },
        });
      });
    } catch (err) {
      console.error('[DeliveryBoyLink] post-complete order sync failed:', err);
    }

    return this.getBoyPortalOrderView(token, fulfilmentId);
  }

  async failViaBoy(
    token: string,
    fulfilmentId: string,
    failedReason: DeliveryFailReason,
    failedReasonOther?: string,
  ) {
    const { fulfilment } = await this.loadBoyFulfilmentContext(token, fulfilmentId);
    this.assertBoyFulfilmentActionable(fulfilment.status, fulfilment.order.status, {
      requireActionable: true,
    });

    const reasonText = formatDeliveryFailReason(failedReason, failedReasonOther);
    const fromStatus = fulfilment.status;
    const toStatus: FulfilmentStatus = 'failed_delivery';

    await prisma.$transaction(async (tx) => {
      await tx.fulfilment.update({
        where: { id: fulfilment.id },
        data: { status: toStatus, failedReason: reasonText },
      });

      const activeDispatch = fulfilment.dispatches[0];
      if (activeDispatch) {
        await tx.dispatch.update({
          where: { id: activeDispatch.id },
          data: { status: 'failed_delivery', notes: reasonText },
        });
      }

      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.FAILED_DELIVERY,
          fromStatus,
          toStatus,
          payload: {
            failedReason,
            failedReasonOther: failedReasonOther ?? null,
            reasonText,
            via: 'boy_portal',
          },
        },
      });
      await tx.fulfilmentEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          action: FULFILMENT_EVENT_ACTIONS.STATUS_CHANGED,
          fromStatus,
          toStatus,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          fulfilmentId: fulfilment.id,
          actorId: null,
          kind: 'failed',
          payload: { failedReason: reasonText, via: 'boy_portal' },
        },
      });

      await recordOrderEvent(tx, {
        orderId: fulfilment.orderId,
        actorId: null,
        action: FULFILMENT_EVENT_ACTIONS.FAILED_DELIVERY,
        fromStatus: 'shipped',
        toStatus: 'shipped',
        payload: {
          fulfilmentId: fulfilment.id,
          failedReason: reasonText,
          via: 'boy_portal',
        },
      });
    });

    return this.getBoyPortalOrderView(token, fulfilmentId);
  }
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export const deliveryLinkService = new DeliveryLinkService();

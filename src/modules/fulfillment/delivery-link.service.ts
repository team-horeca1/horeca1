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

export function deliveryLinkAbsoluteUrl(token: string): string {
  const base = (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${deliveryLinkPath(token)}`;
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
      if (row.fulfilment.status !== 'out_for_delivery') {
        if (row.fulfilment.status === 'failed_delivery') {
          throw Errors.badRequest(
            'Delivery attempt already failed. Wait for the vendor to reschedule.',
          );
        }
        if (row.fulfilment.status === 'delivered') {
          throw Errors.badRequest('This order is already delivered.');
        }
        throw Errors.badRequest(
          `Cannot act on this delivery while status is "${row.fulfilment.status}".`,
        );
      }
    }
  }

  /** Public view payload — never includes the customer OTP code. */
  async getPublicView(token: string) {
    const row = await this.loadByToken(token);
    const now = new Date();
    const uiStatus = toDeliveryUiStatus(row.fulfilment.status);
    const actionable =
      !row.revokedAt &&
      row.expiresAt > now &&
      !row.usedAt &&
      row.fulfilment.status === 'out_for_delivery';

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
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export const deliveryLinkService = new DeliveryLinkService();

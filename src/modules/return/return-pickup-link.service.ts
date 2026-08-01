/**
 * Public magic-link POD for return pickup (delivery-boy, no login).
 * Mirrors delivery-link.service — tokens created on schedule_pickup; path /r/[token].
 */

import { randomBytes, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  RETURN_EVENT_ACTIONS,
  formatReturnPickupFailReason,
  mapLegacyReturnStatus,
  type ReturnPickupFailReason,
  type ReturnStatus,
} from '@/modules/return/return.types';

type Db = Prisma.TransactionClient | typeof prisma;

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PICKUP_OTP_TTL_MS = 48 * 60 * 60 * 1000;

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

export function returnPickupLinkPath(token: string): string {
  return `/r/${token}`;
}

export function returnPickupLinkAbsoluteUrl(token: string): string {
  const base = (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${returnPickupLinkPath(token)}`;
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

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
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

/**
 * Issue/rotate 4-digit pickup OTP on the return (48h), optionally SMS the customer.
 * Never returns the code to public callers when `sendSms` is used from magic link.
 */
export async function issueReturnPickupOtp(
  returnRequestId: string,
  options: { sendSms?: boolean; actorId?: string | null } = {},
): Promise<{ otp: string; expiresAt: Date }> {
  const { sendSms = false, actorId = null } = options;

  const ret = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    select: {
      id: true,
      status: true,
      order: {
        select: {
          orderNumber: true,
          user: { select: { phone: true } },
        },
      },
    },
  });
  if (!ret) throw Errors.notFound('Return request');

  const status = mapLegacyReturnStatus(ret.status);
  if (status !== 'pickup_scheduled') {
    throw Errors.badRequest(
      `Pickup OTP can only be issued while pickup is scheduled (current: ${ret.status}).`,
    );
  }

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const expiresAt = new Date(Date.now() + PICKUP_OTP_TTL_MS);

  await prisma.returnRequest.update({
    where: { id: returnRequestId },
    data: {
      pickupOtp: otp,
      pickupOtpExpiresAt: expiresAt,
      pickupOtpVerifiedAt: null,
    },
  });

  if (sendSms) {
    const phone = ret.order.user.phone;
    if (phone) {
      try {
        const { sendPhoneOtp } = await import('@/lib/providers/otpSms');
        await sendPhoneOtp(phone, otp);
      } catch (err) {
        console.error('[Return] Pickup OTP SMS failed:', err);
        throw Errors.badRequest(
          err instanceof Error
            ? err.message
            : 'Failed to send pickup OTP SMS. Try again.',
        );
      }
    } else {
      console.warn(
        `[Return] Pickup OTP for ${ret.order.orderNumber}: customer has no phone — code stored only`,
      );
    }

    await appendReturnEvent(prisma, {
      returnRequestId,
      actorId,
      action: RETURN_EVENT_ACTIONS.PICKUP_OTP_ISSUED,
      fromStatus: ret.status,
      toStatus: ret.status,
      payload: { expiresAt: expiresAt.toISOString(), via: actorId ? 'vendor' : 'magic_link' },
    });
  }

  return { otp, expiresAt };
}

export class ReturnPickupLinkService {
  /** Create a new token; revoke any prior active tokens for the return. */
  async createToken(
    db: Db,
    input: {
      returnRequestId: string;
      deliveryBoyName?: string | null;
      deliveryBoyPhone?: string | null;
      expiresAt?: Date;
    },
  ): Promise<{ id: string; token: string; path: string; url: string; expiresAt: Date }> {
    const now = new Date();
    await db.returnPickupAccessToken.updateMany({
      where: {
        returnRequestId: input.returnRequestId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    const token = generateOpaqueToken();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + TOKEN_TTL_MS);
    const row = await db.returnPickupAccessToken.create({
      data: {
        id: randomUUID(),
        token,
        returnRequestId: input.returnRequestId,
        deliveryBoyName: input.deliveryBoyName?.trim() || null,
        deliveryBoyPhone: input.deliveryBoyPhone?.trim() || null,
        expiresAt,
      },
      select: { id: true, token: true, expiresAt: true },
    });

    return {
      id: row.id,
      token: row.token,
      path: returnPickupLinkPath(row.token),
      url: returnPickupLinkAbsoluteUrl(row.token),
      expiresAt: row.expiresAt,
    };
  }

  async getActiveTokenForReturn(returnRequestId: string) {
    return prisma.returnPickupAccessToken.findFirst({
      where: {
        returnRequestId,
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
    const row = await prisma.returnPickupAccessToken.findUnique({
      where: { token },
      include: {
        returnRequest: {
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
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                deliveryAddressSnapshot: true,
                vendor: {
                  select: {
                    id: true,
                    businessName: true,
                    displayName: true,
                    logoUrl: true,
                  },
                },
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
            customer: {
              select: {
                fullName: true,
                businessName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Return pickup link');
    return row;
  }

  private assertTokenUsable(
    row: Awaited<ReturnType<ReturnPickupLinkService['loadByToken']>>,
    opts: { requireActionable?: boolean } = {},
  ) {
    const now = new Date();
    if (row.revokedAt) {
      throw Errors.badRequest(
        'This pickup link was revoked. Ask the vendor for a new pickup link.',
      );
    }
    if (row.expiresAt < now) {
      throw Errors.badRequest('This pickup link has expired. Ask the vendor to reschedule.');
    }
    if (opts.requireActionable) {
      if (row.usedAt) {
        throw Errors.badRequest('This pickup is already completed.');
      }
      const status = mapLegacyReturnStatus(row.returnRequest.status);
      if (status !== 'pickup_scheduled') {
        if (status === 'goods_received' || status === 'inspection_completed' || status === 'closed') {
          throw Errors.badRequest('Return goods were already received.');
        }
        throw Errors.badRequest(
          `Cannot act on this pickup while return status is "${row.returnRequest.status}".`,
        );
      }
    }
  }

  /** Public view — never includes the customer OTP code. */
  async getPublicView(token: string) {
    const row = await this.loadByToken(token);
    const now = new Date();
    const status = mapLegacyReturnStatus(row.returnRequest.status) as ReturnStatus;
    const actionable =
      !row.revokedAt &&
      row.expiresAt > now &&
      !row.usedAt &&
      status === 'pickup_scheduled';

    const addressSource =
      row.returnRequest.pickupAddress?.trim() ||
      null;
    const snapAddress = formatAddress(row.returnRequest.order.deliveryAddressSnapshot);
    const addressLines = addressSource
      ? [addressSource]
      : snapAddress.lines;

    const customerName =
      row.returnRequest.customer.fullName ||
      row.returnRequest.customer.businessName ||
      row.returnRequest.order.user.fullName ||
      row.returnRequest.order.user.businessName ||
      snapAddress.label ||
      row.returnRequest.order.outlet?.name ||
      'Customer';

    return {
      token: row.token,
      path: returnPickupLinkPath(row.token),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      usedAt: row.usedAt?.toISOString() ?? null,
      deliveryBoyName: row.deliveryBoyName,
      deliveryBoyPhone: row.deliveryBoyPhone,
      status,
      canRequestOtp: actionable,
      canComplete: actionable,
      canFail: actionable,
      vendor: {
        name:
          row.returnRequest.order.vendor.displayName ||
          row.returnRequest.order.vendor.businessName,
        logoUrl: row.returnRequest.order.vendor.logoUrl,
      },
      returnRequest: {
        id: row.returnRequest.id,
        status,
        pickupAt: row.returnRequest.pickupAt?.toISOString() ?? null,
        invoiceNumber: row.returnRequest.invoiceNumber,
        order: {
          id: row.returnRequest.order.id,
          orderNumber: row.returnRequest.order.orderNumber,
        },
        customer: {
          name: customerName,
          phone: row.returnRequest.customer.phone ?? row.returnRequest.order.user.phone,
          email: row.returnRequest.customer.email ?? row.returnRequest.order.user.email,
        },
        address: {
          label: snapAddress.label,
          lines: addressLines,
          pincode: snapAddress.pincode,
          full: [...addressLines, snapAddress.pincode].filter(Boolean).join(', '),
        },
        items: row.returnRequest.items
          .filter((i) => i.decision === 'approved' || i.decision === 'partial' || i.decision === 'pending')
          .map((item) => ({
            id: item.id,
            productName: item.orderItem.productName,
            qty: item.approvedQty ?? item.requestedQty,
            sku: item.orderItem.product?.sku ?? null,
            unit: item.orderItem.product?.unit ?? null,
            imageUrl: item.orderItem.product?.imageUrl ?? null,
          })),
      },
    };
  }

  async requestOtp(token: string) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const result = await issueReturnPickupOtp(row.returnRequestId, { sendSms: true });

    return {
      sent: true,
      expiresAt: result.expiresAt.toISOString(),
      customerPhoneMasked: maskPhone(
        row.returnRequest.customer.phone ?? row.returnRequest.order.user.phone,
      ),
    };
  }

  async complete(token: string, otp: string) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const now = new Date();
    const code = otp.trim();
    const ret = row.returnRequest;

    if (!ret.pickupOtp) {
      throw Errors.badRequest(
        'No pickup OTP yet. Tap Complete to send an OTP to the customer first.',
      );
    }
    if (code !== ret.pickupOtp) {
      throw Errors.badRequest(
        'Pickup OTP does not match. Ask the customer for the code sent to their phone.',
      );
    }
    if (ret.pickupOtpExpiresAt && ret.pickupOtpExpiresAt < now) {
      throw Errors.badRequest('Pickup OTP has expired. Request a new OTP and retry.');
    }

    const fromStatus = ret.status;

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: ret.id },
        data: {
          status: 'goods_received',
          goodsReceivedAt: now,
          pickupOtpVerifiedAt: now,
        },
      });

      await tx.returnPickupAccessToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      });

      await appendReturnEvent(tx, {
        returnRequestId: ret.id,
        actorId: null,
        action: RETURN_EVENT_ACTIONS.GOODS_RECEIVED,
        fromStatus,
        toStatus: 'goods_received',
        payload: {
          receivedAt: now.toISOString(),
          via: 'magic_link',
          deliveryBoyName: row.deliveryBoyName,
        },
      });
    });

    return this.getPublicView(token);
  }

  async fail(
    token: string,
    failedReason: ReturnPickupFailReason,
    failedReasonOther?: string,
  ) {
    const row = await this.loadByToken(token);
    this.assertTokenUsable(row, { requireActionable: true });

    const reasonText = formatReturnPickupFailReason(failedReason, failedReasonOther);
    const fromStatus = row.returnRequest.status;

    await appendReturnEvent(prisma, {
      returnRequestId: row.returnRequestId,
      actorId: null,
      action: RETURN_EVENT_ACTIONS.PICKUP_FAILED,
      fromStatus,
      toStatus: fromStatus,
      payload: {
        failedReason,
        failedReasonOther: failedReasonOther ?? null,
        reasonText,
        via: 'magic_link',
      },
    });

    // Stay pickup_scheduled — vendor can resend OTP / boy retries.
    return this.getPublicView(token);
  }
}

export const returnPickupLinkService = new ReturnPickupLinkService();

// GET /api/v1/vendor/promotions/payouts/[key] — Vendor-scoped payout detail
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorContext } from '@/lib/resolveVendorId';

function extractKey(req: NextRequest): string {
  const raw = new URL(req.url).pathname.split('/').at(-1) ?? '';
  return decodeURIComponent(raw).trim().toUpperCase();
}

function claimUrlForToken(token: string): string {
  const base = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  return base ? `${base}/payout/${token}` : `/payout/${token}`;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.view');
    const trackingKey = extractKey(req);
    if (!/^H1P-[A-Z0-9]{4,8}$/.test(trackingKey)) {
      throw Errors.badRequest('Invalid tracking ID');
    }

    const invite = await prisma.payoutInvite.findFirst({
      where: { trackingKey, vendorId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            businessName: true,
            hcidDisplay: true,
          },
        },
        cashbackEntry: {
          select: { id: true, status: true, upiId: true, paidReference: true, paidAt: true },
        },
      },
    });
    if (!invite) throw Errors.notFound('Payout');

    const now = Date.now();
    const awaiting = invite.status === 'pending' && (invite.expiresAt == null || invite.expiresAt.getTime() > now);
    const status = invite.status === 'cancelled'
      ? 'cancelled'
      : awaiting
        ? 'awaiting_claim'
        : invite.status === 'pending'
          ? 'expired'
          : invite.cashbackEntry?.status === 'paid'
            ? 'paid'
            : 'approved';

    return NextResponse.json({
      success: true,
      data: {
        trackingKey,
        inviteId: invite.id,
        entryId: invite.cashbackEntryId,
        amount: Number(invite.amount),
        notes: invite.notes,
        referenceNumber: invite.referenceNumber,
        destination: 'upi' as const,
        status,
        upiId: invite.claimedUpiId ?? invite.cashbackEntry?.upiId ?? null,
        paidReference: invite.cashbackEntry?.paidReference ?? null,
        paidAt: invite.cashbackEntry?.paidAt ?? null,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        claimedAt: invite.claimedAt,
        claimedName: invite.claimedName,
        claimedBusinessName: invite.claimedBusinessName,
        user: invite.user,
        claimUrl: claimUrlForToken(invite.token),
        claimable: awaiting,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET /api/v1/admin/promotions/payouts/[key] — Payout / grant detail by tracking ID
// Returns the claim URL so ops can recover a forgotten payout link.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

function extractKey(req: NextRequest): string {
  const raw = new URL(req.url).pathname.split('/').at(-1) ?? '';
  return decodeURIComponent(raw).trim().toUpperCase();
}

function claimUrlForToken(token: string): string {
  const base = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  return base ? `${base}/payout/${token}` : `/payout/${token}`;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const trackingKey = extractKey(req);
    if (!/^H1P-[A-Z0-9]{4,8}$/.test(trackingKey)) {
      throw Errors.badRequest('Invalid tracking ID');
    }

    const invite = await prisma.payoutInvite.findUnique({
      where: { trackingKey },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, businessName: true } },
        cashbackEntry: {
          select: {
            id: true,
            status: true,
            destination: true,
            upiId: true,
            paidReference: true,
            paidAt: true,
            creditedAt: true,
            notes: true,
          },
        },
      },
    });

    const entry = invite?.cashbackEntryId
      ? await prisma.cashbackEntry.findUnique({
          where: { id: invite.cashbackEntryId },
          include: {
            user: { select: { id: true, fullName: true, phone: true, email: true, businessName: true } },
            campaign: { select: { id: true, name: true } },
            order: { select: { id: true, orderNumber: true } },
            payoutInvite: { select: { id: true, token: true, status: true, expiresAt: true, claimedName: true, claimedUpiId: true } },
          },
        })
      : await prisma.cashbackEntry.findUnique({
          where: { trackingKey },
          include: {
            user: { select: { id: true, fullName: true, phone: true, email: true, businessName: true } },
            campaign: { select: { id: true, name: true } },
            order: { select: { id: true, orderNumber: true } },
            payoutInvite: { select: { id: true, token: true, status: true, expiresAt: true, claimedName: true, claimedUpiId: true } },
          },
        });

    if (!invite && !entry) throw Errors.notFound('Payout');

    const now = Date.now();
    const invitePending = invite?.status === 'pending' && invite.expiresAt.getTime() > now;
    const token = invite?.token ?? entry?.payoutInvite?.token ?? null;

    const amount = invite ? Number(invite.amount) : Number(entry?.amount ?? 0);
    const status = invitePending
      ? 'awaiting_claim'
      : entry?.status ?? (invite && invite.expiresAt.getTime() <= now ? 'expired' : invite?.status);

    return NextResponse.json({
      success: true,
      data: {
        trackingKey,
        kind: invitePending || (invite && !entry) ? 'invite' : 'entry',
        id: entry?.id ?? invite?.id,
        inviteId: invite?.id ?? entry?.payoutInvite?.id ?? null,
        entryId: entry?.id ?? invite?.cashbackEntryId ?? null,
        amount,
        notes: entry?.notes ?? invite?.notes ?? null,
        destination: entry?.destination ?? 'upi',
        source: entry?.source ?? 'payout_invite',
        status,
        upiId: entry?.upiId ?? invite?.claimedUpiId ?? null,
        paidReference: entry?.paidReference ?? null,
        paidAt: entry?.paidAt ?? null,
        creditedAt: entry?.creditedAt ?? null,
        createdAt: invite?.createdAt ?? entry?.createdAt,
        expiresAt: invite?.expiresAt ?? entry?.payoutInvite?.expiresAt ?? null,
        claimedAt: invite?.claimedAt ?? null,
        claimedName: invite?.claimedName ?? entry?.payoutInvite?.claimedName ?? null,
        user: entry?.user ?? invite?.user ?? null,
        campaign: entry?.campaign ?? null,
        order: entry?.order ?? null,
        claimUrl: token ? claimUrlForToken(token) : null,
        claimable: Boolean(invitePending && token),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

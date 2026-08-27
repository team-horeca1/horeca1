// GET /api/v1/admin/promotions/entries — Cashback entries (UPI payout queue + history)
// WHY: UPI cashbacks are paid out manually in Phase 1 — ops filters
//      status=approved&destination=upi, transfers, then marks each paid.
// Also merges pending (unclaimed) payout invites so notes + tracking ID are visible
// before the recipient claims. `search` matches tracking ID, notes, user, UPI, UTR.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { listEntriesQuerySchema } from '@/modules/promotion/promotion.validator';

const EMPTY_USER = {
  id: '',
  fullName: 'Open payout link',
  phone: null as string | null,
  email: null as string | null,
  businessName: null as string | null,
};

function contains(q: string): Prisma.StringFilter {
  return { contains: q, mode: 'insensitive' };
}

/** Match dashed tracking IDs, pasted compact keys, and phone digits. */
function searchTerms(q: string): string[] {
  const raw = q.trim();
  if (!raw) return [];
  const compact = raw.replace(/[\s-]/g, '');
  const terms = [raw];
  if (compact && compact.toLowerCase() !== raw.toLowerCase()) terms.push(compact);
  const dashed = compact.match(/^h1p([a-z0-9]{6})$/i);
  if (dashed) terms.push(`H1P-${dashed[1].toUpperCase()}`);
  return [...new Set(terms)];
}

function entrySearchWhere(q: string): Prisma.CashbackEntryWhereInput {
  const ors: Prisma.CashbackEntryWhereInput[] = [];
  for (const term of searchTerms(q)) {
    const f = contains(term);
    ors.push(
      { trackingKey: f },
      { notes: f },
      { upiId: f },
      { paidReference: f },
      { user: { fullName: f } },
      { user: { phone: f } },
      { user: { email: f } },
      { user: { businessName: f } },
    );
  }
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4) {
    ors.push({ user: { phone: { contains: digits } } });
    if (digits.length >= 10) ors.push({ user: { phone: { contains: digits.slice(-10) } } });
  }
  return { OR: ors };
}

function inviteSearchWhere(q: string): Prisma.PayoutInviteWhereInput {
  const ors: Prisma.PayoutInviteWhereInput[] = [];
  for (const term of searchTerms(q)) {
    const f = contains(term);
    ors.push(
      { trackingKey: f },
      { notes: f },
      { claimedUpiId: f },
      { claimedName: f },
      { user: { fullName: f } },
      { user: { phone: f } },
      { user: { email: f } },
      { user: { businessName: f } },
    );
  }
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4) {
    ors.push({ user: { phone: { contains: digits } } });
    if (digits.length >= 10) ors.push({ user: { phone: { contains: digits.slice(-10) } } });
  }
  return { OR: ors };
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const query = listEntriesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const search = query.search?.trim() || undefined;
    const statusFilter = search ? undefined : query.status;

    const entries = await prisma.cashbackEntry.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(query.destination ? { destination: query.destination } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(search ? entrySearchWhere(search) : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, businessName: true } },
        campaign: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > query.limit;
    if (hasMore) entries.pop();

    const includePendingInvites =
      (!statusFilter || statusFilter === 'approved') &&
      query.destination !== 'wallet' &&
      !query.cursor;

    const inviteRows = includePendingInvites
      ? (
          await prisma.payoutInvite.findMany({
            where: {
              status: 'pending',
              expiresAt: { gt: new Date() },
              cashbackEntryId: null,
              ...(query.userId ? { userId: query.userId } : {}),
              ...(search ? inviteSearchWhere(search) : {}),
            },
            include: {
              user: { select: { id: true, fullName: true, phone: true, email: true, businessName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: query.limit,
          })
        ).map((inv) => ({
          id: inv.id,
          amount: inv.amount,
          destination: 'upi' as const,
          status: 'awaiting_claim' as const,
          source: 'payout_invite' as const,
          upiId: null,
          paidReference: null,
          notes: inv.notes,
          trackingKey: inv.trackingKey,
          createdAt: inv.createdAt,
          user: inv.user ?? EMPTY_USER,
          campaign: null,
          order: null,
          rowKind: 'invite' as const,
        }))
      : [];

    const entryRows = entries.map((e) => ({ ...e, rowKind: 'entry' as const }));
    const merged = [...inviteRows, ...entryRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, query.limit);

    return NextResponse.json({
      success: true,
      data: {
        entries: merged,
        pagination: { next_cursor: hasMore ? entries[entries.length - 1]?.id : null, has_more: hasMore },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

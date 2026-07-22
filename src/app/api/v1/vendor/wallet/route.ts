// GET  /api/v1/vendor/wallet — Vendor wallet balance + transaction history + payout info
// POST /api/v1/vendor/wallet — Admin adjustment (credit/debit)
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { resolvePlatformFeePct } from '@/modules/vendor/vendorSettlement.service';

const adjustmentSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['credit', 'debit']),
  notes: z.string().max(500).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    // Wallet exposes balance + payout/settlement history — finance data that
    // storefront-only buyers and Viewers shouldn't see.
    requirePermission(ctx, 'wallet.view');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const take = 30;

    // Ensure wallet exists (auto-create on first access)
    const wallet = await prisma.vendorWallet.upsert({
      where: { vendorId },
      create: { vendorId, balance: 0, pendingAmount: 0 },
      update: {},
    });

    const txns = await prisma.vendorWalletTxn.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = txns.length > take;
    const items = txns.slice(0, take);
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Next settlement date: every Monday
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const nextSettlement = new Date(now);
    nextSettlement.setDate(now.getDate() + daysUntilMonday);

    // Payout history — last 10 VendorSettlement records for this vendor
    const settlements = await prisma.vendorSettlement.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        netAmount: true,
        status: true,
        bankReference: true,
        periodStart: true,
        periodEnd: true,
        settledAt: true,
        createdAt: true,
      },
    });

    const payouts = settlements.map((s) => ({
      id: s.id,
      amount: Number(s.netAmount),
      status: s.status,
      reference: s.bankReference ?? null,
      periodStart: s.periodStart.toISOString().split('T')[0],
      periodEnd: s.periodEnd.toISOString().split('T')[0],
      settledAt: s.settledAt ? s.settledAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    }));

    // Pending payout — sum of order_credit txns in the last 2 days
    // (these are earned but not yet settled)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const recentCredits = await prisma.vendorWalletTxn.aggregate({
      where: {
        walletId: wallet.id,
        type: 'order_credit',
        createdAt: { gte: twoDaysAgo },
      },
      _sum: { amount: true },
    });
    const pendingPayout = Number(recentCredits._sum.amount ?? 0);

    const [effectivePlatformFeePct, vendorRow, monthFees] = await Promise.all([
      resolvePlatformFeePct(vendorId),
      prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { platformFeePct: true },
      }),
      prisma.order.aggregate({
        _sum: { settlementPlatformFee: true, settlementGrossAmount: true },
        where: {
          vendorId,
          status: 'delivered',
          deliveredAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        wallet: {
          balance: wallet.balance,
          pendingAmount: wallet.pendingAmount,
          nextSettlementDate: nextSettlement.toISOString().split('T')[0],
        },
        feeInfo: {
          effectivePlatformFeePct,
          isCustomRate: vendorRow?.platformFeePct != null,
          monthGross: Number(monthFees._sum.settlementGrossAmount ?? 0),
          monthPlatformFees: Number(monthFees._sum.settlementPlatformFee ?? 0),
        },
        transactions: items.map((t) => ({
          ...t,
          grossAmount: t.grossAmount != null ? Number(t.grossAmount) : null,
          platformFee: t.platformFee != null ? Number(t.platformFee) : null,
          gatewayFee: t.gatewayFee != null ? Number(t.gatewayFee) : null,
          netAmount: t.netAmount != null ? Number(t.netAmount) : null,
          amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
        })),
        nextCursor,
        payouts,
        pendingPayout,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    if (ctx.role !== 'admin') {
      throw Errors.forbidden('Admin only');
    }
    // Finance mutation — scoped to impersonated/owned vendor only (no body.vendorId bypass).
    requirePermission(ctx, 'wallet.create');
    const body = adjustmentSchema.parse(await req.json());
    const vendorId = await resolveVendorId(ctx, req);

    const wallet = await prisma.vendorWallet.upsert({
      where: { vendorId },
      create: { vendorId, balance: 0, pendingAmount: 0 },
      update: {},
    });

    const delta = body.type === 'credit' ? body.amount : -body.amount;
    const newBalance = Math.round((Number(wallet.balance) + delta) * 100) / 100;
    if (newBalance < 0) throw Errors.badRequest('Adjustment would make balance negative');

    await prisma.$transaction(async (tx) => {
      await tx.vendorWalletTxn.create({
        data: {
          walletId: wallet.id,
          type: 'adjustment',
          amount: Math.abs(body.amount),
          balanceAfter: newBalance,
          notes: body.notes ?? `Admin ${body.type}`,
        },
      });
      await tx.vendorWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          ...(body.type === 'credit'
            ? { pendingAmount: { increment: body.amount } }
            : { pendingAmount: { decrement: Math.min(body.amount, Number(wallet.pendingAmount)) } }),
        },
      });
    });

    return NextResponse.json({ success: true, data: { balance: newBalance } });
  } catch (error) {
    return errorResponse(error);
  }
});

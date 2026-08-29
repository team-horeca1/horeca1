// GET /api/v1/wallet/[walletId] — single DiSCCO credit line for the owner only.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

function extractWalletId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // …/api/v1/wallet/<walletId>
  return segments[segments.length - 1] ?? '';
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const walletId = extractWalletId(req);
    if (!walletId) throw Errors.badRequest('walletId required');

    const ownerId = effectiveCustomerUserId(ctx);
    const existing = await prisma.creditWallet.findUnique({
      where: { id: walletId },
      select: { userId: true },
    });
    if (!existing || existing.userId !== ownerId) throw Errors.notFound('Credit line');
    await creditWalletService.healReservedCreditForUser(ownerId);

    const wallet = await prisma.creditWallet.findUnique({
      where: { id: walletId },
      include: {
        vendor: { select: { id: true, businessName: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        repayments: { orderBy: { createdAt: 'desc' }, take: 20 },
        penalties: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!wallet) throw Errors.notFound('Credit line');

    const terms = await creditWalletService.resolveWalletConfig(wallet.id);

    return NextResponse.json({
      success: true,
      data: {
        ...wallet,
        terms: {
          repaymentMode: terms.repaymentMode,
          billingModel: terms.billingModel,
          creditTenureDays: terms.creditTenureDays,
          gracePeriodDays: terms.gracePeriodDays,
          interestRatePct: terms.interestRatePct,
          interestFrequencyDays: terms.interestFrequencyDays,
          penaltyAmount: terms.penaltyAmount,
          penaltyFrequencyDays: terms.penaltyFrequencyDays,
          blacklistDays: terms.blacklistDays,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

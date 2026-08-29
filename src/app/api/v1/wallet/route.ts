// GET /api/v1/wallet — the logged-in customer's DiSCCO credit lines
// (supplier-backed + optional Horeca1 platform credit). Distinct from H1 Wallet
// cash balance at /rewards (Prisma Wallet / promotions).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const userId = effectiveCustomerUserId(ctx);
    await creditWalletService.healReservedCreditForUser(userId);
    const wallets = await prisma.creditWallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        vendor: { select: { id: true, businessName: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 15 },
        repayments: { orderBy: { createdAt: 'desc' }, take: 10 },
        penalties: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    const data = await Promise.all(
      wallets.map(async (w) => {
        const terms = await creditWalletService.resolveWalletConfig(w.id);
        return {
          ...w,
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
        };
      }),
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

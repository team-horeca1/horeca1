// POST /api/v1/credit/signup — Credit onboarding status (eligibility)
// WHY: Legacy flow created a "pending" CreditAccount for a vendor to approve.
//      In the unified CreditWallet world a customer does not self-create a credit
//      line — eligibility is earned via successful orders, then admin/vendor
//      assigns the wallet. This endpoint surfaces that status so the signup UI
//      can show how close the customer is to unlocking credit.
// PROTECTED: Must be logged in.

import { NextRequest, NextResponse } from 'next/server';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { eligible, orderCount, threshold } = await creditWalletService.checkEligibility(effectiveCustomerUserId(ctx));

    return NextResponse.json(
      {
        success: true,
        data: {
          eligible,
          orderCount,
          threshold,
          ordersRemaining: Math.max(0, threshold - orderCount),
          message: eligible
            ? 'Eligible for credit — a wallet is assigned by Horeca1/your vendor.'
            : `Complete ${Math.max(0, threshold - orderCount)} more successful order(s) to unlock credit.`,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(error);
  }
});

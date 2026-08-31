// POST /api/v1/credit/apply — Request a Horeca1 credit line (eligibility check)
// WHY: In the unified CreditWallet world, credit is NOT self-applied to a specific
//      order — checkout debits the wallet automatically (order.service →
//      creditWalletService.debitWallet). A credit LINE itself is assigned by an
//      admin/vendor once the customer is eligible. This endpoint reports the
//      caller's eligibility (≥ N successful orders) so the UI can either show
//      "request submitted / pending review" or "X more orders to unlock".
// PROTECTED: Must be logged in.

import { NextRequest, NextResponse } from 'next/server';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { eligible, orderCount, threshold } = await creditWalletService.checkEligibility(effectiveCustomerUserId(ctx));

    return NextResponse.json({
      success: true,
      data: {
        eligible,
        orderCount,
        threshold,
        ordersRemaining: Math.max(0, threshold - orderCount),
        message: eligible
          ? 'You meet the eligibility criteria. A credit line is assigned by Horeca1/your vendor — no further action needed.'
          : `Complete ${Math.max(0, threshold - orderCount)} more successful order(s) to become eligible for credit.`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

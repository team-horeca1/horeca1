// GET /api/v1/promotions/rewards — Wallet balance + cashback history for
//     the logged-in user. Powers the /rewards page.
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { promotionService } from '@/modules/promotion/promotion.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const data = await promotionService.getRewards(effectiveCustomerUserId(ctx));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

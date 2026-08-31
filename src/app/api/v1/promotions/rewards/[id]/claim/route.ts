// POST /api/v1/promotions/rewards/:id/claim — Attach a UPI ID to an
//      unclaimed UPI cashback ("Grab your incentive" flow).
// PROTECTED: Must be logged in — entry must belong to the caller

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { promotionService } from '@/modules/promotion/promotion.service';
import { claimUpiSchema } from '@/modules/promotion/promotion.validator';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

function extractEntryId(req: NextRequest) {
  // /api/v1/promotions/rewards/:id/claim → second-to-last segment
  return new URL(req.url).pathname.split('/').at(-2) ?? '';
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = claimUpiSchema.parse(await req.json());
    const entry = await promotionService.claimUpi(extractEntryId(req), effectiveCustomerUserId(ctx), body.upiId);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return errorResponse(error);
  }
});

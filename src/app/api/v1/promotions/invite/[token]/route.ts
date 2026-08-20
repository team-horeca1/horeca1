// GET /api/v1/promotions/invite/[token] — Record a referral click and set the
//     attribution cookie for the following signup.
// PUBLIC: rate-limited

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { attachReferralCookie } from '@/lib/referralCookie';
import { promotionService } from '@/modules/promotion/promotion.service';
import { programTokenSchema } from '@/modules/promotion/promotion.validator';

function extractToken(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

export async function GET(req: NextRequest) {
  try {
    const { allowed } = await checkRateLimit(`promo-invite:${getClientIp(req)}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const token = programTokenSchema.parse(extractToken(req));
    const data = await promotionService.recordReferralClick(token);
    const res = NextResponse.json({ success: true, data });
    attachReferralCookie(res, token);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}

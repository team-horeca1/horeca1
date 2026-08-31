// GET  /api/v1/promotions/referral — Caller's invite link + referral status
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { promotionService } from '@/modules/promotion/promotion.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

function requestOrigin(req: NextRequest): string | null {
  const xfHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = xfHost || req.headers.get('host');
  if (!host) return null;
  const xfProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = xfProto || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const data = await promotionService.getMyReferral(effectiveCustomerUserId(ctx), {
      originOverride: requestOrigin(req),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET  /api/v1/promotions/payout/[token] — Public payout-invite preview
// POST /api/v1/promotions/payout/[token] — Claim with first name, business name, UPI
// PUBLIC: rate-limited. Amount is never taken from the client.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { promotionService } from '@/modules/promotion/promotion.service';
import { claimPayoutInviteSchema, programTokenSchema } from '@/modules/promotion/promotion.validator';

function extractToken(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const allowed = new Set<string>();
    const requestHost = req.headers.get('host');
    if (requestHost) allowed.add(requestHost);
    allowed.add(req.nextUrl.host);
    const appUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
    if (appUrl) allowed.add(new URL(appUrl).host);
    return allowed.has(originHost);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { allowed } = await checkRateLimit(`promo-payout-get:${getClientIp(req)}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const token = programTokenSchema.parse(extractToken(req));
    const data = await promotionService.getPayoutInvitePublic(token);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) {
      throw Errors.forbidden('Invalid origin');
    }
    const { allowed } = await checkRateLimit(`promo-payout-claim:${getClientIp(req)}`, 8, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const token = programTokenSchema.parse(extractToken(req));
    const body = claimPayoutInviteSchema.parse(await req.json());
    const session = await auth();
    const result = await promotionService.claimPayoutInvite({
      token,
      name: body.name,
      businessName: body.businessName,
      upiId: body.upiId,
      sessionUserId: session?.user?.id ?? null,
    });
    return NextResponse.json({
      success: true,
      data: { claimed: true, amount: Number(result.invite.amount), trackingKey: result.entry.trackingKey ?? result.invite.trackingKey },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

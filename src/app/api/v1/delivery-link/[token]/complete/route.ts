// POST /api/v1/delivery-link/:token/complete — verify OTP → delivered

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';
import {
  deliveryLinkCompleteSchema,
  deliveryLinkTokenParamSchema,
} from '@/modules/fulfillment/delivery-link.validator';

function extractToken(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../delivery-link/:token/complete
  return segments[segments.length - 2]!;
}

async function postHandler(req: NextRequest) {
  try {
    const token = deliveryLinkTokenParamSchema.parse(extractToken(req));
    const body = deliveryLinkCompleteSchema.parse(await req.json());
    const data = await deliveryLinkService.complete(token, body.otp);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
